import type { ShipmentStatus } from "@/types/shipments";

/**
 * Visual tone for Recent Shipments status / action cells.
 * Red (`danger`) is reserved for Delayed and Action Required only.
 */
export type ShipmentDashboardTone =
  | "success"
  | "danger"
  | "actionPrimary"
  | "accent"
  | "info"
  | "neutral"
  | "warning";

/**
 * Maps API shipment status → dashboard tone. Extend when new operational statuses are added.
 */
export function getShipmentDashboardTone(status: string | ShipmentStatus): ShipmentDashboardTone {
  const s = status.toUpperCase();
  if (s === "DELIVERED") return "success";
  if (s === "DELAYED" || s === "ACTION_REQUIRED") return "danger";
  if (s === "INITIATE_SHIPPING_DOCUMENT") return "actionPrimary";
  if (s === "TRANSPORT_CONFIRMED") return "accent";
  if (s === "BIDDING_TRANSPORTER") return "warning";
  if (s === "READY_PICKUP") return "neutral";
  if (s === "PICKED_UP" || s === "ON_SHIPMENT" || s === "CUSTOMS_CLEARANCE") return "info";
  return "neutral";
}
