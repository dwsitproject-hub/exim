export function shipmentActivityTypeLabel(type: string): string {
  switch (type) {
    case "shipment_created":
      return "Created";
    case "status_change":
      return "Status";
    case "note":
      return "Note";
    case "couple_po":
      return "PO grouped";
    case "decouple_po":
      return "PO removed";
    case "shipment_updated":
      return "Update";
    default:
      return "Activity";
  }
}

export function poActivityTypeLabel(type: string): string {
  switch (type) {
    case "po_created":
      return "Created";
    case "po_claimed":
      return "Claimed";
    case "couple_shipment":
      return "Shipment linked";
    case "decouple_shipment":
      return "Shipment removed";
    case "po_updated":
      return "Update";
    default:
      return "Activity";
  }
}

export type ExportBulkingActivityType =
  | "export_bulking_created"
  | "status_change"
  | "shipment_updated"
  | "documentation_assigned";

export function exportBulkingActivityTypeLabel(type: ExportBulkingActivityType | string): string {
  switch (type) {
    case "export_bulking_created":
      return "Created";
    case "status_change":
      return "Status";
    case "shipment_updated":
      return "Update";
    case "documentation_assigned":
      return "Assignment";
    default:
      return "Activity";
  }
}
