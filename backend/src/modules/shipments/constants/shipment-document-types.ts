/**
 * Allowed shipment document categories for upload API and UI.
 * Uploads do not use draft/final status (column may be null or legacy); intake_id only for PO.
 */

export const SHIPMENT_DOCUMENT_TYPES = [
  "PO",
  "INVOICE",
  "BL",
  "COO",
  "INSURANCE",
  "PACKING_LIST",
  "PIB_BC",
  "SPPB",
  "FORWARDER_QUOTATION",
  "LS",
  "VO",
  "SPPBMCP",
  "MSDS",
  "B3",
  "DG",
] as const;

export type ShipmentDocumentType = (typeof SHIPMENT_DOCUMENT_TYPES)[number];

export const SHIPMENT_DOCUMENT_STATUSES = ["DRAFT", "FINAL"] as const;
export type ShipmentDocumentStatus = (typeof SHIPMENT_DOCUMENT_STATUSES)[number];

/** Only PO is scoped per linked intake; packing list is shipment-level. */
const REQUIRES_INTAKE_ID = new Set<ShipmentDocumentType>(["PO"]);

export function shipmentDocumentRequiresIntakeId(type: string): boolean {
  return REQUIRES_INTAKE_ID.has(type as ShipmentDocumentType);
}

export function isAllowedShipmentDocumentType(type: string): type is ShipmentDocumentType {
  return (SHIPMENT_DOCUMENT_TYPES as readonly string[]).includes(type);
}
