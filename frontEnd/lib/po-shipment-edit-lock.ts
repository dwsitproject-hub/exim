/**
 * Mirrors backend `po-intake-shipment-lock` + `SHIPMENT_STATUSES` order.
 * PO edits are blocked when any linked shipment is at Ready Pickup or later.
 */

const SHIPMENT_STATUSES = [
  "INITIATE_SHIPPING_DOCUMENT",
  "BIDDING_TRANSPORTER",
  "TRANSPORT_CONFIRMED",
  "READY_PICKUP",
  "PICKED_UP",
  "ON_SHIPMENT",
  "CUSTOMS_CLEARANCE",
  "DELIVERED",
] as const;

const READY_PICKUP_INDEX = SHIPMENT_STATUSES.indexOf("READY_PICKUP");

export function shipmentStatusBlocksPoEdit(status: string): boolean {
  const idx = SHIPMENT_STATUSES.indexOf(status as (typeof SHIPMENT_STATUSES)[number]);
  if (idx < 0) return false;
  return idx >= READY_PICKUP_INDEX;
}

export function anyLinkedShipmentBlocksPoEdit(shipments: { current_status: string }[]): boolean {
  return shipments.some((s) => shipmentStatusBlocksPoEdit(s.current_status));
}

export const PO_EDIT_BLOCKED_BY_SHIPMENT_MESSAGE =
  "This PO is linked to a shipment in Ready Pickup, Picked up, On shipment, Customs clearance, or Delivered. Editing is not allowed.";
