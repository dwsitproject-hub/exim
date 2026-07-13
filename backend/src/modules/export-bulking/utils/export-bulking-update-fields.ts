/**
 * Field labels and diff helpers for export bulking shipment PATCH activity log.
 */

import type { UpdateExportBulkingShipmentDto, ExportBulkingShipmentRow } from "../dto/index.js";

export const EXPORT_BULKING_UPDATE_FIELD_LABELS: Record<string, string> = {
  vessel_name: "Vessel",
  voyage_number: "Voyage",
  shipper: "Shipper",
  loadport_name: "Loadport",
  received_nomination: "Received nomination",
  received_shipping_instruction: "Received SI",
  incoterms: "Incoterms",
  laycan: "Laycan",
  laycan_from: "Laycan from",
  laycan_to: "Laycan to",
  est_cargo_readiness: "Est. cargo readiness",
  est_cargo_readiness_period: "Est. cargo readiness period",
  eta: "ETA",
  ata: "ATA",
  nor: "NOR",
  etb: "ETB",
  atb: "ATB",
  commence_loading: "Commence loading",
  etc: "ETC",
  atc: "ATC",
  hose_on: "Hose on",
  hose_off: "Hose off",
  bl_figure: "BL figure",
  ship_figure: "Ship figure",
  npe_date: "NPE date",
  quantity_spb: "Quantity SPB",
  spb: "SPB",
  delivery_order_pgi: "Delivery order / PGI",
  spr: "SPR",
  bill_of_lading_no: "Bill of lading no.",
  bill_of_lading_date: "Bill of lading date",
  bill_of_lading_nn_obl: "BL NN/OBL",
  sent_bl: "Sent BL",
  sent_coo: "Sent COO",
  sent_phyto: "Sent phyto",
  sent_hc: "Sent HC",
  sent_sr: "Sent SR",
  sent_sustainability: "Sent sustainability",
  present_docs: "Present docs",
  peb_request_no: "PEB request no.",
  peb_no: "PEB no.",
  peb_date: "PEB date",
  pe_no: "PE no.",
  pe_date: "PE date",
  hs_code: "HS code",
  currency_tax: "Currency tax",
  biaya_keluar_price_usd_mt: "Biaya keluar (USD/MT)",
  biaya_keluar_amount_idr: "Biaya keluar (IDR)",
  biaya_keluar_billing_no: "Biaya keluar billing no.",
  levy_price_usd_mt: "Levy (USD/MT)",
  levy_amount_idr: "Levy (IDR)",
  levy_billing_no: "Levy billing no.",
  billing_to_gl: "Billing to GL",
  td: "TD",
  surveyor: "Surveyor",
  surveyor_reason: "Surveyor reason",
  agent: "Agent",
  remarks: "Remarks",
  length_over_all: "Length overall",
  laytime_rate_mtph: "Laytime rate (MTPH)",
  demurrage_rate_pdpr: "Demurrage rate (PDPR)",
  total_quantity: "Total quantity",
  required_sent_documents: "Required sent documents",
  documentation_assigned_to: "Documentation PIC",
};

export function getExportBulkingUpdateFieldLabel(key: string): string {
  return EXPORT_BULKING_UPDATE_FIELD_LABELS[key] ?? key;
}

function normalizeFieldValue(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function collectExportBulkingUpdateFieldKeys(dto: UpdateExportBulkingShipmentDto): string[] {
  return (Object.keys(dto) as (keyof UpdateExportBulkingShipmentDto)[]).filter(
    (k) => dto[k] !== undefined,
  ) as string[];
}

export function collectExportBulkingFieldChanges(
  before: ExportBulkingShipmentRow,
  after: ExportBulkingShipmentRow,
  keys: string[],
): Array<{ field: string; before: string | null; after: string | null }> {
  const out: Array<{ field: string; before: string | null; after: string | null }> = [];
  const beforeRecord = before as unknown as Record<string, unknown>;
  const afterRecord = after as unknown as Record<string, unknown>;
  for (const key of keys) {
    const beforeValue = normalizeFieldValue(beforeRecord[key]);
    const afterValue = normalizeFieldValue(afterRecord[key]);
    if (beforeValue === afterValue) continue;
    out.push({ field: key, before: beforeValue, after: afterValue });
  }
  return out;
}
