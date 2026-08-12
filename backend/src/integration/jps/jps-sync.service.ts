/**
 * Sync EOS Sea shipments to JPS.
 * First submit is explicit (preview + Send). Later Pending edits auto-PATCH.
 */

import { config } from "../../config/index.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { ShipmentPoMappingRepository } from "../../modules/shipments/repositories/shipment-po-mapping.repository.js";
import { ShipmentRepository } from "../../modules/shipments/repositories/shipment.repository.js";
import type { ShipmentRow } from "../../modules/shipments/dto/index.js";
import { logger } from "../../utils/logger.js";
import { JpsApiClient } from "./jps-api-client.js";
import {
  buildJpsSyncPreview,
  dtoTouchesJpsMappedFields,
  mapShipmentToJpsPatchPayload,
  mapShipmentToJpsPayload,
} from "./jps-shipping-instruction-mapper.js";
import { JpsApiError, type JpsShippingInstructionData } from "./types.js";

function formatJpsError(err: unknown): string {
  if (err instanceof JpsApiError) {
    const parts = [`${err.code}: ${err.message}`];
    if (err.requestId) parts.push(`request_id=${err.requestId}`);
    return parts.join(" | ").slice(0, 2000);
  }
  return (err instanceof Error ? err.message : String(err)).slice(0, 2000);
}

function allocationFields(data: JpsShippingInstructionData): {
  jps_jetty_name: string | null;
  jps_planned_berthing_time: Date | null;
} {
  const name = data.allocation?.jetty_name?.trim() || null;
  const raw = data.allocation?.planned_berthing_time;
  const when = raw ? new Date(raw) : null;
  return {
    jps_jetty_name: name,
    jps_planned_berthing_time: when && !Number.isNaN(when.getTime()) ? when : null,
  };
}

export function isJpsEligible(shipment: ShipmentRow): boolean {
  if (shipment.deleted_at) return false;
  if ((shipment.shipment_method ?? "").trim().toLowerCase() !== "sea") return false;
  if (!(shipment.destination_unload_port_id ?? "").trim()) return false;
  if (shipment.jps_port_id == null || !Number.isFinite(Number(shipment.jps_port_id))) return false;
  if (!(shipment.vessel_name ?? "").trim()) return false;
  if (!(shipment.agent_name ?? "").trim()) return false;
  if (!shipment.eta) return false;
  const tonnage = shipment.net_weight_mt != null ? Number(shipment.net_weight_mt) : NaN;
  if (!Number.isFinite(tonnage) || tonnage <= 0) return false;
  if (!(shipment.jps_cargo_type ?? "").trim()) return false;
  return true;
}

export function isJpsConfigReady(): boolean {
  return (
    config.jps.enabled &&
    Boolean(config.jps.apiBaseUrl?.trim()) &&
    Boolean(config.jps.apiKey?.trim())
  );
}

export class JpsSyncService {
  constructor(
    private readonly repo: ShipmentRepository = new ShipmentRepository(),
    private readonly mappingRepo: ShipmentPoMappingRepository = new ShipmentPoMappingRepository(),
    private readonly client: JpsApiClient = JpsApiClient.fromConfig()
  ) {}

  /**
   * After shipment save: never first-POST automatically.
   * If already submitted and mapped fields changed → dirty + PATCH while Pending.
   */
  async syncAfterShipmentSave(
    shipmentId: string,
    options?: { requestedBy?: string | null; dto?: Record<string, unknown> }
  ): Promise<void> {
    if (!isJpsConfigReady()) return;

    const shipment = await this.repo.findById(shipmentId);
    if (!shipment) return;
    if (shipment.jps_si_id == null) return;
    if (!isJpsEligible(shipment)) return;

    const touchesMapped =
      options?.dto == null || dtoTouchesJpsMappedFields(options.dto) || shipment.jps_sync_dirty;
    if (!touchesMapped && !shipment.jps_sync_dirty) return;

    await this.repo.updateJpsSync(shipmentId, { jps_sync_dirty: true });
    await this.tryUpdate(shipmentId, options?.requestedBy);
  }

  async getPreview(shipmentId: string, requestedBy?: string | null) {
    if (!isJpsConfigReady()) {
      throw new AppError("JPS sync is not configured", 503);
    }
    const shipment = await this.repo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    if (!isJpsEligible(shipment)) {
      throw new AppError(
        "Shipment is not ready for Jetty sync. Need Sea method, a Jetty-linked destination unload port, vessel, agent, ETA, net weight (MT), and Jetty commodity.",
        400
      );
    }
    const contractNo = await this.firstLinkedPoNumber(shipmentId);
    return buildJpsSyncPreview({ shipment, requestedBy, contractNo });
  }

  /**
   * Explicit first send (or resync while Pending). Used by "Send to Jetty" after preview.
   */
  async syncNow(shipmentId: string, requestedBy?: string | null): Promise<ShipmentRow> {
    if (!isJpsConfigReady()) {
      throw new AppError("JPS sync is not configured", 503);
    }
    const shipment = await this.repo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    if (!isJpsEligible(shipment)) {
      throw new AppError(
        "Shipment is not ready for Jetty sync. Need Sea method, a Jetty-linked destination unload port, vessel, agent, ETA, net weight (MT), and Jetty commodity.",
        400
      );
    }

    if (shipment.jps_si_id == null) {
      await this.create(shipmentId, requestedBy);
    } else {
      await this.tryUpdate(shipmentId, requestedBy, { throwOnError: true });
    }

    const updated = await this.repo.findById(shipmentId);
    if (!updated) throw new AppError("Shipment not found", 404);
    if (updated.jps_last_error && updated.jps_si_id == null) {
      throw new AppError(updated.jps_last_error, 502);
    }
    return updated;
  }

  async create(shipmentId: string, requestedBy?: string | null): Promise<void> {
    if (!isJpsConfigReady()) return;
    const shipment = await this.repo.findById(shipmentId);
    if (!shipment || !isJpsEligible(shipment)) return;
    if (shipment.jps_si_id != null) return;

    const contractNo = await this.firstLinkedPoNumber(shipmentId);
    try {
      const payload = mapShipmentToJpsPayload({
        shipment,
        requestedBy,
        contractNo,
      });
      const data = await this.client.createShippingInstruction(payload);
      const now = new Date();
      await this.repo.updateJpsSync(shipmentId, {
        jps_si_id: data.id,
        jps_status: data.status ?? "Pending",
        jps_external_reference: data.external_reference ?? payload.external_reference,
        jps_submitted_at: now,
        jps_last_synced_at: now,
        jps_sync_dirty: false,
        jps_last_error: null,
        jps_rejection_reason: data.rejection_reason ?? null,
        ...allocationFields(data),
      });
      logger.info("JPS SI created", {
        shipmentId,
        jpsSiId: data.id,
        externalReference: payload.external_reference,
      });
    } catch (err) {
      if (err instanceof JpsApiError && err.code === "DUPLICATE_REFERENCE") {
        await this.recoverFromDuplicate(shipmentId, shipment.shipment_no);
        return;
      }
      const message = formatJpsError(err);
      await this.repo.updateJpsSync(shipmentId, { jps_last_error: message });
      logger.warn("JPS SI create failed", { shipmentId, error: message });
      throw err instanceof AppError ? err : new AppError(message, 502);
    }
  }

  async tryUpdate(
    shipmentId: string,
    requestedBy?: string | null,
    options?: { throwOnError?: boolean }
  ): Promise<void> {
    if (!isJpsConfigReady()) return;
    const shipment = await this.repo.findById(shipmentId);
    if (!shipment || shipment.jps_si_id == null || !isJpsEligible(shipment)) return;

    if (shipment.jps_status === "Rejected") {
      await this.repo.updateJpsSync(shipmentId, {
        jps_sync_dirty: true,
        jps_last_error:
          "JPS status is Rejected; submit a new SI with a new external_reference (explicit resubmit)",
      });
      if (options?.throwOnError) {
        throw new AppError(
          "Jetty rejected this instruction. Resubmit with a new reference after fixing data.",
          409
        );
      }
      return;
    }

    if (shipment.jps_status && shipment.jps_status !== "Pending") {
      await this.repo.updateJpsSync(shipmentId, {
        jps_sync_dirty: true,
        jps_last_error: `JPS status is ${shipment.jps_status}; PATCH only allowed while Pending (NOT_EDITABLE)`,
      });
      if (options?.throwOnError) {
        throw new AppError(
          `Cannot update Jetty instruction while status is ${shipment.jps_status}.`,
          409
        );
      }
      return;
    }

    const contractNo = await this.firstLinkedPoNumber(shipmentId);
    try {
      const payload = mapShipmentToJpsPatchPayload({
        shipment,
        requestedBy,
        contractNo,
        externalReference: shipment.jps_external_reference ?? shipment.shipment_no,
      });
      const data = await this.client.updateShippingInstruction(shipment.jps_si_id, payload);
      const now = new Date();
      await this.repo.updateJpsSync(shipmentId, {
        jps_status: data.status ?? shipment.jps_status,
        jps_last_synced_at: now,
        jps_sync_dirty: false,
        jps_last_error: null,
        jps_rejection_reason: data.rejection_reason ?? null,
        ...allocationFields(data),
      });
      logger.info("JPS SI patched", { shipmentId, jpsSiId: shipment.jps_si_id });
    } catch (err) {
      const message = formatJpsError(err);
      await this.repo.updateJpsSync(shipmentId, {
        jps_sync_dirty: true,
        jps_last_error: message,
      });
      logger.warn("JPS SI patch failed", { shipmentId, error: message });
      if (options?.throwOnError) {
        throw err instanceof AppError ? err : new AppError(message, 502);
      }
    }
  }

  async pollStatus(shipmentId: string): Promise<void> {
    if (!isJpsConfigReady()) return;
    const shipment = await this.repo.findById(shipmentId);
    if (!shipment?.jps_si_id) return;

    try {
      const data = await this.client.getShippingInstructionById(shipment.jps_si_id);
      await this.repo.updateJpsSync(shipmentId, {
        jps_status: data.status ?? shipment.jps_status,
        jps_rejection_reason: data.rejection_reason ?? null,
        jps_last_error: null,
        ...allocationFields(data),
      });
    } catch (err) {
      const message = formatJpsError(err);
      await this.repo.updateJpsSync(shipmentId, { jps_last_error: message });
      logger.warn("JPS SI poll failed", { shipmentId, error: message });
    }
  }

  async runStatusPollCycle(): Promise<{ polled: number }> {
    if (!isJpsConfigReady()) return { polled: 0 };
    const rows = await this.repo.listForJpsStatusPoll(100);
    for (const row of rows) {
      await this.pollStatus(row.id);
    }
    return { polled: rows.length };
  }

  async resubmitAfterRejection(shipmentId: string, requestedBy?: string | null): Promise<void> {
    if (!isJpsConfigReady()) return;
    const shipment = await this.repo.findById(shipmentId);
    if (!shipment || !isJpsEligible(shipment)) return;
    if (shipment.jps_status !== "Rejected") {
      throw new AppError("Resubmit is only allowed when JPS status is Rejected", 409);
    }

    const base = shipment.shipment_no;
    const prev = shipment.jps_external_reference ?? base;
    const match = /-R(\d+)$/.exec(prev);
    const nextN = match ? parseInt(match[1]!, 10) + 1 : 2;
    const externalReference = `${base}-R${nextN}`.slice(0, 100);

    const contractNo = await this.firstLinkedPoNumber(shipmentId);
    try {
      const payload = mapShipmentToJpsPayload({
        shipment,
        requestedBy,
        contractNo,
        externalReference,
      });
      const data = await this.client.createShippingInstruction(payload);
      const now = new Date();
      await this.repo.updateJpsSync(shipmentId, {
        jps_si_id: data.id,
        jps_status: data.status ?? "Pending",
        jps_external_reference: externalReference,
        jps_submitted_at: now,
        jps_last_synced_at: now,
        jps_sync_dirty: false,
        jps_last_error: null,
        jps_rejection_reason: null,
        jps_jetty_name: null,
        jps_planned_berthing_time: null,
      });
    } catch (err) {
      const message = formatJpsError(err);
      await this.repo.updateJpsSync(shipmentId, { jps_last_error: message });
      throw err instanceof AppError ? err : new AppError(message, 502);
    }
  }

  private async recoverFromDuplicate(shipmentId: string, shipmentNo: string): Promise<void> {
    try {
      const data = await this.client.getShippingInstructionByExternalReference(shipmentNo);
      const now = new Date();
      await this.repo.updateJpsSync(shipmentId, {
        jps_si_id: data.id,
        jps_status: data.status ?? "Pending",
        jps_external_reference: data.external_reference ?? shipmentNo,
        jps_submitted_at: now,
        jps_last_synced_at: now,
        jps_sync_dirty: false,
        jps_last_error: null,
        jps_rejection_reason: data.rejection_reason ?? null,
        ...allocationFields(data),
      });
      logger.info("JPS SI recovered from DUPLICATE_REFERENCE", {
        shipmentId,
        jpsSiId: data.id,
      });
    } catch (err) {
      const message = formatJpsError(err);
      await this.repo.updateJpsSync(shipmentId, { jps_last_error: message });
      logger.warn("JPS SI duplicate recovery failed", { shipmentId, error: message });
      throw new AppError(message, 502);
    }
  }

  private async firstLinkedPoNumber(shipmentId: string): Promise<string | null> {
    const linked = await this.mappingRepo.findActiveByShipmentId(shipmentId);
    const po = linked[0]?.po_number?.trim();
    return po || null;
  }
}

let sharedSync: JpsSyncService | null = null;

export function getJpsSyncService(): JpsSyncService {
  if (!sharedSync) sharedSync = new JpsSyncService();
  return sharedSync;
}
