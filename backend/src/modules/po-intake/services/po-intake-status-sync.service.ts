/**
 * Derives PO intake_status from linked shipments + delivered qty vs PO lines.
 * Persisted on events and reconciled on read (list/detail).
 */

import { PoIntakeRepository } from "../repositories/po-intake.repository.js";
import { ShipmentPoMappingRepository } from "../../shipments/repositories/shipment-po-mapping.repository.js";
import { ShipmentPoLineReceivedRepository } from "../../shipments/repositories/shipment-po-line-received.repository.js";
import { getApplicableShipmentStatuses } from "../../shipments/utils/shipment-status-chain.js";
import type { IntakeStatus } from "../dto/index.js";

const PICKED_UP = "PICKED_UP";
const DELIVERED = "DELIVERED";

/** node-pg returns DECIMAL/NUMERIC as strings — coerce before arithmetic. */
function coercePgNumeric(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const t = value.replace(/,/g, "").trim();
    if (t === "") return 0;
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

const repo = new PoIntakeRepository();
const mappingRepo = new ShipmentPoMappingRepository();
const lineReceivedRepo = new ShipmentPoLineReceivedRepository();

function isAtLeastPickedUp(currentStatus: string, incoterm: string | null): boolean {
  const chain = getApplicableShipmentStatuses(incoterm);
  const i = chain.indexOf(currentStatus);
  const p = chain.indexOf(PICKED_UP);
  if (i === -1 || p === -1) return false;
  return i >= p;
}

function isAllLinkedDelivered(linked: { current_status: string }[]): boolean {
  return linked.length > 0 && linked.every((s) => s.current_status === DELIVERED);
}

export type ComputePoStatusResult = {
  status: IntakeStatus;
  overshipped: boolean;
};

/**
 * Pure status from facts. Unclaimed + no shipment link stays NEW_PO_DETECTED; unclaimed + linked uses shipment facts (same as claimed).
 */
export async function computePoIntakeStatus(intakeId: string): Promise<ComputePoStatusResult> {
  const row = await repo.findById(intakeId);
  if (!row) {
    return { status: "NEW_PO_DETECTED", overshipped: false };
  }

  const items = await repo.findItemsByIntakeId(intakeId);
  const linked = await mappingRepo.findActiveShipmentsByIntakeId(intakeId);

  const totalPoQty = items.reduce((s, it) => s + coercePgNumeric(it.qty), 0);
  let totalReceived = 0;
  for (const it of items) {
    totalReceived += await lineReceivedRepo.getTotalReceivedByIntakeItem(intakeId, it.id);
  }
  const overshipped = totalPoQty > 0 && totalReceived > totalPoQty;

  if (linked.length === 0) {
    if (!row.taken_by_user_id) {
      return { status: "NEW_PO_DETECTED", overshipped };
    }
    return { status: "CLAIMED", overshipped };
  }

  const allDelivered = isAllLinkedDelivered(linked);
  const anyPickedUp = linked.some((l) => isAtLeastPickedUp(l.current_status, l.incoterm ?? null));

  if (anyPickedUp && totalReceived < totalPoQty) {
    return { status: "PARTIALLY_SHIPPED", overshipped };
  }

  if (allDelivered && totalPoQty > 0 && totalReceived >= totalPoQty) {
    return { status: "FULFILLED", overshipped };
  }
  if (allDelivered && totalPoQty <= 0) {
    return { status: "FULFILLED", overshipped: false };
  }

  if (
    totalPoQty > 0 &&
    totalReceived >= totalPoQty &&
    !allDelivered &&
    anyPickedUp
  ) {
    return { status: "SHIPPED", overshipped };
  }

  return { status: "ALLOCATION_IN_PROGRESS", overshipped };
}

/** Persist computed status when it differs from DB. Returns the status after sync (always computed). */
export async function syncPoIntakeStatus(intakeId: string): Promise<ComputePoStatusResult> {
  const { status, overshipped } = await computePoIntakeStatus(intakeId);
  const row = await repo.findById(intakeId);
  if (row && row.intake_status !== status) {
    await repo.updateIntakeStatus(intakeId, status);
  }
  return { status, overshipped };
}

export async function syncPoIntakeStatusesForShipment(shipmentId: string): Promise<void> {
  const linked = await mappingRepo.findActiveByShipmentId(shipmentId);
  const ids = [...new Set(linked.map((l) => l.intake_id))];
  await Promise.all(ids.map((id) => syncPoIntakeStatus(id)));
}
