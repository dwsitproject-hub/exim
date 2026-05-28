/**
 * Shipment document categories aligned with backend API.
 * Visibility of some slots depends on shipment header fields (surveyor, PIB type, product classification).
 */

import { isChemicalProductClassification } from "@/lib/product-classification";

export type DocSlotVisibility =
  | "always"
  | "surveyor_yes"
  | "pib_consignment_note"
  | "product_chemical";

export type ShipmentDocSlot =
  | { document_type: string; label: string; statuses?: undefined; per_linked_po?: boolean; showWhen?: DocSlotVisibility }
  | {
      document_type: string;
      label: string;
      statuses: readonly ("DRAFT" | "FINAL")[];
      per_linked_po?: boolean;
      showWhen?: DocSlotVisibility;
    };

/** Ordered: PO → Commercial Invoice → Packing List → BL, then the rest. */
export const SHIPMENT_DOCUMENT_SLOTS: ShipmentDocSlot[] = [
  { document_type: "PO", label: "PO", per_linked_po: true },
  { document_type: "INVOICE", label: "Commercial Invoice" },
  { document_type: "PACKING_LIST", label: "Packing List" },
  { document_type: "BL", label: "BL" },
  { document_type: "COO", label: "COO (Certificate of Origin)" },
  { document_type: "INSURANCE", label: "Insurance" },
  { document_type: "PIB_BC", label: "PIB / BC" },
  { document_type: "SPPB", label: "SPPB" },
  { document_type: "LS", label: "Laporan Surveyor (LS)", showWhen: "surveyor_yes" },
  { document_type: "VO", label: "VO", showWhen: "surveyor_yes" },
  { document_type: "SPPBMCP", label: "SPPBMCP", showWhen: "pib_consignment_note" },
  { document_type: "MSDS", label: "MSDS", showWhen: "product_chemical" },
  { document_type: "B3", label: "B3", showWhen: "product_chemical" },
  { document_type: "DG", label: "Dangerous Goods (DG)", showWhen: "product_chemical" },
];

export type ShipmentDetailForDocSlots = {
  surveyor: string | null;
  pib_type: string | null;
  product_classification: string | null;
};

function isPibConsignmentNote(pibType: string | null | undefined): boolean {
  const p = (pibType ?? "").trim();
  return p === "Consignment Note" || p === "Consignee Note";
}

export function shipmentDocSlotVisible(slot: ShipmentDocSlot, detail: ShipmentDetailForDocSlots): boolean {
  const when = slot.showWhen ?? "always";
  switch (when) {
    case "always":
      return true;
    case "surveyor_yes":
      return (detail.surveyor ?? "").trim() === "Yes";
    case "pib_consignment_note":
      return isPibConsignmentNote(detail.pib_type);
    case "product_chemical":
      return isChemicalProductClassification(detail.product_classification);
    default:
      return true;
  }
}

export function getVisibleShipmentDocumentSlots(detail: ShipmentDetailForDocSlots): ShipmentDocSlot[] {
  return SHIPMENT_DOCUMENT_SLOTS.filter((s) => shipmentDocSlotVisible(s, detail));
}
