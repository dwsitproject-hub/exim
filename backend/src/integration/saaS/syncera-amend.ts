/**
 * Build Syncera amendment payloads and apply them via PoIntakeService.updateIntake.
 */

import type { PoIntakeItemRow, UpdatePoIntakeDto, UpdatePoIntakeItemDto } from "../../modules/po-intake/dto/index.js";
import type { PoIntakeService } from "../../modules/po-intake/services/po-intake.service.js";
import { AppError } from "../../middlewares/errorHandler.js";
import { anyLinkedShipmentBlocksPoEdit } from "../../modules/po-intake/utils/po-intake-shipment-lock.js";
import type { LinkedShipmentByIntake } from "../../modules/shipments/repositories/shipment-po-mapping.repository.js";
import type { SaasPoResponse } from "./types.js";
import { lineMatchKey } from "./syncera-mapper.js";

export const SYNCERA_POLL_ACTOR = "SYNCERA_POLL";

export function buildAmendmentItems(
  mappedItems: NonNullable<SaasPoResponse["items"]>,
  existing: PoIntakeItemRow[]
): UpdatePoIntakeItemDto[] {
  const unused = [...existing].sort((a, b) => a.line_number - b.line_number);
  const out: UpdatePoIntakeItemDto[] = [];
  for (const it of mappedItems) {
    const desc = (it.item_description ?? "").trim();
    const unit = (it.unit ?? "").trim();
    const qty = it.qty;
    const value = it.value;
    if (!desc || qty == null || value == null || !unit) continue;
    const key = lineMatchKey(desc, unit);
    const idx = unused.findIndex((row) => lineMatchKey(row.item_description, row.unit) === key);
    const matched = idx >= 0 ? unused.splice(idx, 1)[0] : undefined;
    out.push({
      id: matched?.id,
      item_description: desc,
      qty,
      unit,
      value,
    });
  }
  return out;
}

export function buildUpdateDto(mapped: SaasPoResponse, existing: PoIntakeItemRow[]): UpdatePoIntakeDto {
  return {
    po_number: mapped.po_number,
    plant: mapped.plant,
    pt: mapped.pt,
    supplier_name: mapped.supplier_name,
    delivery_location: mapped.delivery_location,
    incoterm_location: mapped.incoterm_location,
    kawasan_berikat: mapped.kawasan_berikat,
    currency: mapped.currency,
    items: buildAmendmentItems(mapped.items ?? [], existing),
  };
}

export type AmendOutcome = "updated" | "locked" | "failed";

export async function applySynceraAmendment(args: {
  service: PoIntakeService;
  intakeId: string;
  mapped: SaasPoResponse;
  existingItems: PoIntakeItemRow[];
  linkedShipments: LinkedShipmentByIntake[];
}): Promise<AmendOutcome> {
  if (anyLinkedShipmentBlocksPoEdit(args.linkedShipments)) {
    return "locked";
  }
  const dto = buildUpdateDto(args.mapped, args.existingItems);
  try {
    const updated = await args.service.updateIntake(args.intakeId, dto, SYNCERA_POLL_ACTOR);
    return updated ? "updated" : "failed";
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 409) {
      return "locked";
    }
    throw err;
  }
}
