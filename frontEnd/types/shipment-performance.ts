import type { ShipmentStatus } from "@/types/shipments";

/** Official operational timeline order (matches `ShipmentStatus`). */
export const SHIPMENT_PERFORMANCE_TIMELINE_ORDER: ShipmentStatus[] = [
  "INITIATE_SHIPPING_DOCUMENT",
  "BIDDING_TRANSPORTER",
  "TRANSPORT_CONFIRMED",
  "READY_PICKUP",
  "PICKED_UP",
  "ON_SHIPMENT",
  "CUSTOMS_CLEARANCE",
  "DELIVERED",
];

/** Row shape for the Shipment Performance drill-down modal table. */
export interface ShipmentPerformanceModalRow {
  id: string;
  shipmentNumber: string;
  status: string;
  pt: string | null;
  plant: string | null;
  poNumber: string;
  vendor: string | null;
  forwarder: string;
  eta: string | Date | null;
}

export type OnTimeStatusKind = "on_time" | "late" | "at_risk" | "muted";

export interface OnTimeStatusDisplay {
  label: string;
  kind: OnTimeStatusKind;
}
