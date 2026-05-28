/**
 * Shipment document upload order: PIB type (saved on shipment) → PO → other types.
 */

export type ShipmentWithPibForDocs = { pib_type: string | null };

export type ShipmentDocumentTypeCheck = { document_type: string };

/** True when PIB type is set on the shipment (saved value from API). */
export function canUploadPO(shipment: ShipmentWithPibForDocs): boolean {
  return (shipment.pib_type ?? "").trim().length > 0;
}

/** True when at least one PO document exists for this shipment. */
export function isPOUploaded(documents: ShipmentDocumentTypeCheck[]): boolean {
  return documents.some((d) => d.document_type === "PO");
}

export type DocumentUploadBlockReason = "pib" | "need_po" | "delivered";

export function getShipmentDocumentUploadBlockReason(params: {
  shipment: ShipmentWithPibForDocs;
  documentType: string;
  documents: ShipmentDocumentTypeCheck[];
  shipmentStatusDelivered: boolean;
}): DocumentUploadBlockReason | null {
  if (params.shipmentStatusDelivered) return "delivered";
  if (!canUploadPO(params.shipment)) return "pib";
  if (params.documentType !== "PO" && !isPOUploaded(params.documents)) return "need_po";
  return null;
}

export const DOCUMENT_UPLOAD_TOOLTIP_PIB_FIRST = "Please input PIB Type first to enable PO upload.";

export const DOCUMENT_UPLOAD_TOOLTIP_PO_FIRST = "Upload PO to unlock other documents.";

/** Native `title` on the Upload label when the control is disabled. */
export function getShipmentDocUploadButtonTitle(
  documentType: string,
  block: DocumentUploadBlockReason | null
): string | undefined {
  if (block === "delivered") return "Cannot upload documents when shipment is delivered.";
  if (block === "pib") return DOCUMENT_UPLOAD_TOOLTIP_PIB_FIRST;
  if (block === "need_po" && documentType !== "PO") return DOCUMENT_UPLOAD_TOOLTIP_PO_FIRST;
  return undefined;
}

export function documentRestrictionToastMessage(reason: DocumentUploadBlockReason): string {
  const copy: Record<DocumentUploadBlockReason, string> = {
    pib: "Action Restricted: PIB Type must be defined before uploading documents.",
    need_po: "Action Restricted: Upload the Purchase Order document before uploading other documents.",
    delivered: "Cannot upload documents when shipment is delivered.",
  };
  return copy[reason];
}
