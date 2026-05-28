/**
 * PO header/line edit is blocked when any active linked shipment has reached
 * Ready Pickup or a later lifecycle step (picked up, on shipment, customs, delivered).
 */

import { SHIPMENT_STATUSES } from "../../shipments/dto/index.js";

const READY_PICKUP_INDEX = SHIPMENT_STATUSES.indexOf("READY_PICKUP");

export function shipmentStatusBlocksPoEdit(status: string): boolean {
  const idx = SHIPMENT_STATUSES.indexOf(status as (typeof SHIPMENT_STATUSES)[number]);
  if (idx < 0) return false;
  return idx >= READY_PICKUP_INDEX;
}

export function anyLinkedShipmentBlocksPoEdit(shipments: { current_status: string }[]): boolean {
  return shipments.some((s) => shipmentStatusBlocksPoEdit(s.current_status));
}
