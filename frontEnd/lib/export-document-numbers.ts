import type { ExportBulkingShipmentDetail } from "@/types/export-bulking";

export type ExportDocNumberKind = "si" | "invoice" | "packing_list";

const DOC_NUMBER_LABELS: Record<ExportDocNumberKind, string> = {
  si: "Shipping instruction number",
  invoice: "Invoice number",
  packing_list: "Packing list number",
};

export function normalizeDocNumber(value: string): string {
  return value.trim();
}

/** Shipment-local duplicate check for immediate UX feedback (global check is on the server). */
export function duplicateDocNumberMessage(
  kind: ExportDocNumberKind,
  value: string,
  shipment: ExportBulkingShipmentDetail,
  excludeId: string,
): string | null {
  const normalized = normalizeDocNumber(value).toLowerCase();
  if (!normalized) return null;

  const label = DOC_NUMBER_LABELS[kind];

  if (kind === "si") {
    const dup = shipment.shipping_instructions.some(
      (s) => s.id !== excludeId && (s.si_number?.trim().toLowerCase() ?? "") === normalized,
    );
    return dup ? `${label} "${value.trim()}" is already used on this shipment.` : null;
  }

  if (kind === "invoice") {
    const dup = shipment.invoices.some(
      (i) => i.id !== excludeId && (i.invoice_no?.trim().toLowerCase() ?? "") === normalized,
    );
    return dup ? `${label} "${value.trim()}" is already used on this shipment.` : null;
  }

  const dup = shipment.packing_lists.some(
    (p) => p.id !== excludeId && (p.packing_list_number?.trim().toLowerCase() ?? "") === normalized,
  );
  return dup ? `${label} "${value.trim()}" is already used on this shipment.` : null;
}
