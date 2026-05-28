/**
 * Shipment status service: transition logic and timeline. Forward-only transitions.
 * Validates required fields and documents (aligned with frontEnd shipment-status-requirements).
 */

import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { ShipmentStatusHistoryRepository } from "../repositories/shipment-status-history.repository.js";
import { ShipmentDocumentRepository } from "../repositories/shipment-document.repository.js";
import { ShipmentBidRepository } from "../repositories/shipment-bid.repository.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import {
  type TimelineEntry,
  type UpdateStatusResponseData,
  type StatusSummaryData,
} from "../dto/index.js";
import { getNextAllowedShipmentStatus, isShipmentAllowedForwardTransition } from "../utils/shipment-status-chain.js";
import { syncPoIntakeStatusesForShipment } from "../../po-intake/services/po-intake-status-sync.service.js";
import { ShipmentService } from "./shipment.service.js";
import {
  getMissingRequiredFields,
  getMissingRequiredDocuments,
  getFieldLabel,
  type ShipmentDetailForStatusValidation,
} from "../utils/shipment-status-requirements.js";

export class ShipmentStatusService {
  constructor(
    private readonly shipmentRepo: ShipmentRepository,
    private readonly historyRepo: ShipmentStatusHistoryRepository,
    private readonly shipmentService: ShipmentService,
    private readonly documentRepo: ShipmentDocumentRepository,
    private readonly bidRepo: ShipmentBidRepository
  ) {}

  async updateStatus(
    shipmentId: string,
    newStatus: string,
    remarks: string | null,
    changedBy: string
  ): Promise<UpdateStatusResponseData> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    if (shipment.closed_at && shipment.current_status === "DELIVERED") {
      throw new AppError("Cannot update status of a closed shipment", 409);
    }
    if (shipment.closed_at && newStatus !== "DELIVERED") {
      throw new AppError("Cannot update status of a closed shipment", 409);
    }

    const currentStatus = shipment.current_status;
    if (!isShipmentAllowedForwardTransition(currentStatus, newStatus, shipment.incoterm)) {
      const allowedNext = getNextAllowedShipmentStatus(currentStatus, shipment.incoterm);
      const hint = allowedNext
        ? ` You may set ${allowedNext} or any later status in the workflow.`
        : "";
      throw new AppError(
        `Invalid status transition from ${currentStatus} to ${newStatus}. Only forward moves within the applicable lifecycle are allowed.${hint}`,
        409
      );
    }

    const [detail, docRows, bids] = await Promise.all([
      this.shipmentService.getById(shipmentId),
      this.documentRepo.findByShipmentId(shipmentId),
      this.bidRepo.findByShipmentId(shipmentId),
    ]);
    if (!detail) throw new AppError("Shipment not found", 404);

    const validationDetail: ShipmentDetailForStatusValidation = {
      incoterm: detail.incoterm,
      ship_by: detail.ship_by,
      pib_type: detail.pib_type,
      no_request_pib: detail.no_request_pib,
      ppjk_mkl: detail.ppjk_mkl,
      nopen: detail.nopen,
      nopen_date: detail.nopen_date,
      coo: detail.coo,
      origin_port_name: detail.origin_port_name,
      origin_port_country: detail.origin_port_country,
      etd: detail.etd,
      eta: detail.eta,
      forwarder_name: detail.forwarder_name,
      shipment_method: detail.shipment_method,
      destination_port_name: detail.destination_port_name,
      destination_port_country: detail.destination_port_country,
      surveyor: detail.surveyor,
      bl_awb: detail.bl_awb,
      atd: detail.atd,
      ata: detail.ata,
      depo: detail.depo,
      product_classification: detail.product_classification,
      closed_at: detail.closed_at,
      incoterm_amount: detail.incoterm_amount,
      bids,
      linked_pos: detail.linked_pos.map((po) => ({
        intake_id: po.intake_id,
        currency: po.currency,
        currency_rate: po.currency_rate,
        line_received: po.line_received.map((l) => ({
          received_qty: l.received_qty,
          bm_percentage: l.bm_percentage,
          ppn_percentage: l.ppn_percentage,
          pph_percentage: l.pph_percentage,
        })),
      })),
    };

    const missingFields = getMissingRequiredFields(currentStatus, newStatus, validationDetail);
    const missingDocs = getMissingRequiredDocuments(currentStatus, newStatus, shipment.incoterm, {
      documents: docRows.map((d) => ({
        document_type: d.document_type,
        status: d.status,
        intake_id: d.intake_id,
      })),
      linked_pos: detail.linked_pos.map((p) => ({ intake_id: p.intake_id })),
      surveyor: detail.surveyor,
      pib_type: detail.pib_type,
    });

    if (missingFields.length > 0 || missingDocs.length > 0) {
      const parts: string[] = [];
      const errors: { field: string; message: string }[] = [];
      for (const k of missingFields) {
        const label = getFieldLabel(k);
        parts.push(label);
        errors.push({ field: k, message: `${label} is required before this status change` });
      }
      for (const k of missingDocs) {
        const label = getFieldLabel(k);
        parts.push(label);
        errors.push({ field: k, message: `${label} is required before this status change` });
      }
      throw new AppError(
        `Cannot update status: complete the following first: ${parts.join("; ")}`,
        400,
        errors
      );
    }

    await this.historyRepo.create({
      shipmentId,
      previousStatus: currentStatus,
      newStatus,
      remarks,
      changedBy,
    });

    const updated = await this.shipmentRepo.updateCurrentStatus(shipmentId, newStatus);
    if (!updated) throw new AppError("Failed to update shipment status", 500);

    await syncPoIntakeStatusesForShipment(shipmentId);

    return {
      shipment_id: shipmentId,
      previous_status: currentStatus,
      current_status: newStatus,
      updated_at: updated.updated_at.toISOString(),
    };
  }

  async getTimeline(shipmentId: string): Promise<TimelineEntry[]> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) return [];

    const rows = await this.historyRepo.findByShipmentId(shipmentId);
    if (rows.length === 0) {
      return [
        {
          sequence: 1,
          status: shipment.current_status,
          changed_at: shipment.created_at.toISOString(),
          changed_by: "System",
          remarks: null,
        },
      ];
    }

    const entries: TimelineEntry[] = [];
    const newStatuses = new Set(rows.map((r) => r.new_status));
    const first = rows[0];
    if (first.previous_status != null && !newStatuses.has(first.previous_status)) {
      entries.push({
        sequence: 1,
        status: first.previous_status,
        changed_at: shipment.created_at.toISOString(),
        changed_by: "System",
        remarks: null,
      });
    }

    const exitRemarkByStatus = new Map<string, string | null>();
    for (const row of rows) {
      if (row.previous_status) {
        exitRemarkByStatus.set(row.previous_status, row.remarks ?? null);
      }
    }

    for (const row of rows) {
      entries.push({
        sequence: entries.length + 1,
        status: row.new_status,
        changed_at: row.changed_at.toISOString(),
        changed_by: row.changed_by,
        remarks: exitRemarkByStatus.get(row.new_status) ?? null,
      });
    }

    if (entries.length > 0) {
      const firstStatus = entries[0]?.status;
      if (firstStatus) {
        entries[0] = {
          ...entries[0],
          remarks: exitRemarkByStatus.get(firstStatus) ?? entries[0].remarks ?? null,
        };
      }
    }

    return entries.map((e, i) => ({ ...e, sequence: i + 1 }));
  }

  async getStatusSummary(shipmentId: string): Promise<StatusSummaryData | null> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) return null;

    const rows = await this.historyRepo.findByShipmentId(shipmentId);
    const current = shipment.current_status;
    const lastEntry = rows[rows.length - 1];
    const previous = lastEntry ? lastEntry.previous_status : null;
    const lastUpdatedAt = lastEntry ? lastEntry.changed_at : shipment.updated_at;

    return {
      current_status: current,
      previous_status: previous,
      last_updated_at: lastUpdatedAt.toISOString(),
    };
  }
}

