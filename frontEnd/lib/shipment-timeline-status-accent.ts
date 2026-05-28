/**
 * Central accent mapping for shipment lifecycle (dashboard performance + badges).
 * Delivered: end-state red. In-transit / customs / picked up: green. Transport confirmed: blue.
 * Initiate / bidding / ready: slate.
 */
export type ShipmentTimelineAccent = "red" | "green" | "blue" | "slate";

/** Raw status string → accent key (for CSS modules / charts). */
export const SHIPMENT_TIMELINE_STATUS_ACCENT: Record<string, ShipmentTimelineAccent> = {
  DELIVERED: "red",
  CUSTOMS_CLEARANCE: "green",
  ON_SHIPMENT: "green",
  PICKED_UP: "green",
  TRANSPORT_CONFIRMED: "blue",
  INITIATE_SHIPPING_DOCUMENT: "slate",
  BIDDING_TRANSPORTER: "slate",
  READY_PICKUP: "slate",
};

export function getShipmentTimelineAccent(status: string): ShipmentTimelineAccent {
  const key = status.trim().toUpperCase();
  return SHIPMENT_TIMELINE_STATUS_ACCENT[key] ?? "slate";
}
