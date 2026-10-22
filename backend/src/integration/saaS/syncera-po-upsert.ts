/**
 * Create or amend an import PO from a mapped Syncera payload.
 */

import type { PoIntakeRepository } from "../../modules/po-intake/repositories/po-intake.repository.js";
import type { PoIntakeService } from "../../modules/po-intake/services/po-intake.service.js";
import type { ShipmentPoMappingRepository } from "../../modules/shipments/repositories/shipment-po-mapping.repository.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { logger } from "../../utils/logger.js";
import type { SaasPoResponse } from "./types.js";
import { applySynceraAmendment } from "./syncera-amend.js";
import { fingerprintFromIntake, fingerprintMappedPo, mappedToCreateDto } from "./syncera-mapper.js";
import { notifyImportOfficers } from "./po-detected-notification.service.js";

export type UpsertKind =
  | "ingested"
  | "updated"
  | "unchanged"
  | "skippedConflict"
  | "skippedLockedAmendment"
  | "failed";

export interface UpsertResult {
  kind: UpsertKind;
  intakeId?: string;
  message?: string;
}

export async function upsertMappedPo(args: {
  repo: PoIntakeRepository;
  service: PoIntakeService;
  mappingRepo: ShipmentPoMappingRepository;
  mapped: SaasPoResponse;
}): Promise<UpsertResult> {
  const { repo, service, mappingRepo, mapped } = args;
  const fingerprint = mapped.fingerprint ?? fingerprintMappedPo(mapped);

  const byExternal = await repo.findByExternalId(mapped.external_id);
  let existing = byExternal;
  if (!existing) {
    const byPo = await repo.findRowByPoNumberTrimmed(mapped.po_number);
    if (byPo) {
      const existingExt = byPo.external_id?.trim() || null;
      if (existingExt && existingExt !== mapped.external_id) {
        logger.warn("Syncera PO number conflicts with a different external_id", {
          po_number: mapped.po_number,
          incoming: mapped.external_id,
          existing: existingExt,
        });
        return {
          kind: "skippedConflict",
          intakeId: byPo.id,
          message: `PO number already linked to external_id ${existingExt}; incoming ${mapped.external_id}.`,
        };
      }
      if (!existingExt) {
        await repo.updateExternalId(byPo.id, mapped.external_id);
        byPo.external_id = mapped.external_id;
      }
      existing = byPo;
    }
  }

  if (!existing) {
    const dto = mappedToCreateDto(mapped);
    const row = await repo.createWithItemsInTransaction(dto, "NEW_PO_DETECTED");
    await repo.updateSynceraFingerprint(row.id, fingerprint);
    await notifyImportOfficers({
      type: "po_detected",
      intakeId: row.id,
      poNumber: mapped.po_number,
      supplierName: mapped.supplier_name,
    });
    return { kind: "ingested", intakeId: row.id, message: "New PO created from Syncera." };
  }

  const storedFp = await repo.getSynceraFingerprint(existing.id);
  if (storedFp === fingerprint) {
    return { kind: "unchanged", intakeId: existing.id, message: "No changes since last poll." };
  }
  const items = await repo.findItemsByIntakeId(existing.id);
  if (!storedFp && fingerprintFromIntake(existing, items) === fingerprint) {
    await repo.updateSynceraFingerprint(existing.id, fingerprint);
    return { kind: "unchanged", intakeId: existing.id, message: "No changes since last poll." };
  }

  const linked = await mappingRepo.findActiveShipmentsByIntakeId(existing.id);
  try {
    const outcome = await applySynceraAmendment({
      service,
      intakeId: existing.id,
      mapped,
      existingItems: items,
      linkedShipments: linked,
    });
    if (outcome === "locked") {
      logger.warn("Skipping Syncera amendment: shipment lock", {
        po_number: mapped.po_number,
        intake_id: existing.id,
        statuses: linked.map((s) => s.current_status),
      });
      return {
        kind: "skippedLockedAmendment",
        intakeId: existing.id,
        message: "Amendment blocked: linked shipment is at Ready Pickup or a later status.",
      };
    }
    if (outcome === "failed") {
      return { kind: "failed", intakeId: existing.id, message: "Amendment validation or update failed." };
    }
    await repo.updateSynceraFingerprint(existing.id, fingerprint);
    await notifyImportOfficers({
      type: "po_amended",
      intakeId: existing.id,
      poNumber: mapped.po_number,
    });
    return { kind: "updated", intakeId: existing.id, message: "PO updated from Syncera amendment." };
  } catch (err) {
    const msg = err instanceof AppError ? err.message : String(err);
    logger.warn("Syncera amendment failed", {
      po_number: mapped.po_number,
      intake_id: existing.id,
      error: msg,
    });
    return { kind: "failed", intakeId: existing.id, message: msg };
  }
}
