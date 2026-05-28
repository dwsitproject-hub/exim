/**
 * Shipment operational timeline — list filter labels (match API `current_status` values) and tone for badges.
 */

export const SHIPMENT_LIST_STATUS_FILTER_LABELS = [
  "Initiate Shipping Document",
  "Transport Confirmed",
  "Ready Pickup",
  "Picked Up",
  "On Shipment",
  "Customs Clearance",
  "Delivered",
] as const;

const LABEL_TO_STATUS: Record<(typeof SHIPMENT_LIST_STATUS_FILTER_LABELS)[number], string> = {
  "Initiate Shipping Document": "INITIATE_SHIPPING_DOCUMENT",
  "Transport Confirmed": "TRANSPORT_CONFIRMED",
  "Ready Pickup": "READY_PICKUP",
  "Picked Up": "PICKED_UP",
  "On Shipment": "ON_SHIPMENT",
  "Customs Clearance": "CUSTOMS_CLEARANCE",
  Delivered: "DELIVERED",
};

/** Map UI label → backend `status` query value. */
export function shipmentStatusFilterLabelToApi(label: string): string | undefined {
  return LABEL_TO_STATUS[label as keyof typeof LABEL_TO_STATUS];
}

/** Badge tone for timeline alignment: delivered = red; mid-movement = green; early = blue/slate. */
export function shipmentTimelineStatusTone(status: string | undefined | null): "delivered" | "green" | "early" {
  const s = (status ?? "").toUpperCase();
  if (s === "DELIVERED") return "delivered";
  if (s === "CUSTOMS_CLEARANCE" || s === "ON_SHIPMENT" || s === "PICKED_UP") return "green";
  if (
    s === "READY_PICKUP" ||
    s === "TRANSPORT_CONFIRMED" ||
    s === "INITIATE_SHIPPING_DOCUMENT" ||
    s === "BIDDING_TRANSPORTER"
  ) {
    return "early";
  }
  return "early";
}
