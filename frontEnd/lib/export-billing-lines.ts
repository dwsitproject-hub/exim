/**
 * Billing & Levy helpers — one billing row per sales order (SO) on invoice lines.
 * currency_tax and billing_to_gl stay on the shipment (one per shipment_id).
 */

import type {
  BillingLine,
  BillingLineUpsertPayload,
  ExportBulkingShipmentDetail,
  Invoice,
} from "@/types/export-bulking";
import { distinctSoNosFromShipment } from "@/lib/export-sap-lines";

export { distinctSoNosFromShipment };

function billingBySo(shipment: ExportBulkingShipmentDetail): Map<string, BillingLine> {
  const bySo = new Map<string, BillingLine>();
  for (const line of shipment.billing_lines ?? []) {
    const key = line.so_no.trim();
    if (key) bySo.set(key, line);
  }
  return bySo;
}

/** Sum invoice line quantity (MT) grouped by SO number. */
export function sumInvoiceQtyBySo(invoices: Invoice[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const inv of invoices ?? []) {
    for (const ln of inv.lines ?? []) {
      const so = ln.so_no?.trim();
      if (!so) continue;
      const q = ln.quantity != null ? Number(ln.quantity) : 0;
      if (Number.isNaN(q)) continue;
      totals.set(so, (totals.get(so) ?? 0) + q);
    }
  }
  return totals;
}

export function isBiayaKeluarComplete(shipment: ExportBulkingShipmentDetail): boolean {
  const sos = distinctSoNosFromShipment(shipment);
  if (sos.length === 0) return false;
  const bySo = billingBySo(shipment);
  return sos.every((so) => Boolean(bySo.get(so)?.biaya_keluar_billing_no?.trim()));
}

export function isLevyBillingComplete(shipment: ExportBulkingShipmentDetail): boolean {
  const sos = distinctSoNosFromShipment(shipment);
  if (sos.length === 0) return false;
  const bySo = billingBySo(shipment);
  return sos.every((so) => Boolean(bySo.get(so)?.levy_billing_no?.trim()));
}

export type BillingLineDraft = {
  rowKey: string;
  id?: string;
  so_no: string;
  biaya_keluar_price_usd_mt: string;
  biaya_keluar_amount_idr: string;
  biaya_keluar_billing_no: string;
  levy_price_usd_mt: string;
  levy_amount_idr: string;
  levy_billing_no: string;
};

export type PaymentRequestOcrLineInput = {
  so_no: string;
  qty_mt?: number | null;
  biaya_keluar_amount_idr: number | null;
  levy_amount_idr: number | null;
};

export type PaymentRequestValidation = {
  matched: string[];
  extraInDocument: string[];
  missingFromDocument: string[];
  canApply: boolean;
  blockReason: string | null;
};

function normalizeSoNo(so: string): string {
  return so.trim().replace(/\s+/g, "");
}

/** Compare PR document SOs against invoice SOs for incremental apply. */
export function validatePaymentRequestAgainstInvoice(
  invoiceSos: string[],
  prLines: { so_no: string }[],
): PaymentRequestValidation {
  const invoiceByKey = new Map<string, string>();
  for (const so of invoiceSos) {
    const key = normalizeSoNo(so);
    if (key) invoiceByKey.set(key, so.trim());
  }

  const prByKey = new Map<string, string>();
  for (const line of prLines) {
    const key = normalizeSoNo(line.so_no);
    if (key && !prByKey.has(key)) prByKey.set(key, line.so_no.trim());
  }

  const prSos = [...prByKey.values()];
  const matched = prSos.filter((so) => invoiceByKey.has(normalizeSoNo(so)));
  const extraInDocument = prSos.filter((so) => !invoiceByKey.has(normalizeSoNo(so)));
  const missingFromDocument = invoiceSos.filter((so) => !prByKey.has(normalizeSoNo(so)));

  let blockReason: string | null = null;
  if (extraInDocument.length > 0) {
    blockReason = `SO not on invoice: ${extraInDocument.join(", ")}`;
  } else if (matched.length === 0) {
    blockReason = "No SO in this document matches invoice lines on this shipment.";
  }

  return {
    matched,
    extraInDocument,
    missingFromDocument,
    canApply: blockReason == null,
    blockReason,
  };
}

/** Count billing rows with both BK and Levy billing numbers filled. */
export function countFilledBillingSos(lines: BillingLineDraft[]): { filled: number; total: number } {
  const filled = lines.filter(
    (r) => r.biaya_keluar_billing_no.trim() !== "" && r.levy_billing_no.trim() !== "",
  ).length;
  return { filled, total: lines.length };
}

function formatIdrField(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "";
  return String(value);
}

export function buildBillingLineDrafts(
  shipment: ExportBulkingShipmentDetail,
  formatQty: (value: number | null | undefined) => string,
): BillingLineDraft[] {
  const sos = distinctSoNosFromShipment(shipment);
  const savedBySo = billingBySo(shipment);
  return sos.map((so) => {
    const saved = savedBySo.get(so);
    return {
      rowKey: saved?.id ?? `so-${so}`,
      id: saved?.id,
      so_no: so,
      biaya_keluar_price_usd_mt: formatQty(saved?.biaya_keluar_price_usd_mt ?? null),
      biaya_keluar_amount_idr: formatIdrField(saved?.biaya_keluar_amount_idr),
      biaya_keluar_billing_no: saved?.biaya_keluar_billing_no ?? "",
      levy_price_usd_mt: formatQty(saved?.levy_price_usd_mt ?? null),
      levy_amount_idr: formatIdrField(saved?.levy_amount_idr),
      levy_billing_no: saved?.levy_billing_no ?? "",
    };
  });
}

function parseIdrInput(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = parseInt(t, 10);
  return Number.isNaN(n) ? null : n;
}

export function billingDraftsToUpsertPayload(
  drafts: BillingLineDraft[],
  parseQty: (raw: string) => number | null,
): BillingLineUpsertPayload[] {
  return drafts.map((row, idx) => ({
    id: row.id,
    so_no: row.so_no.trim(),
    line_order: idx + 1,
    biaya_keluar_price_usd_mt: parseQty(row.biaya_keluar_price_usd_mt),
    biaya_keluar_amount_idr: parseIdrInput(row.biaya_keluar_amount_idr),
    biaya_keluar_billing_no: row.biaya_keluar_billing_no.trim() || null,
    levy_price_usd_mt: parseQty(row.levy_price_usd_mt),
    levy_amount_idr: parseIdrInput(row.levy_amount_idr),
    levy_billing_no: row.levy_billing_no.trim() || null,
  }));
}

export type BillingShipmentForm = {
  currency_tax: string;
  billing_to_gl: string;
};

export function buildBillingShipmentForm(
  shipment: ExportBulkingShipmentDetail,
  formatNumeric: (value: number | null | undefined, maxFractionDigits?: number) => string,
): BillingShipmentForm {
  return {
    currency_tax: formatNumeric(shipment.currency_tax, 6),
    billing_to_gl: shipment.billing_to_gl ? shipment.billing_to_gl.slice(0, 10) : "",
  };
}

export function billingShipmentFormToPatch(
  form: BillingShipmentForm,
  parseQty: (raw: string) => number | null,
): { currency_tax: number | null; billing_to_gl: string | null } {
  return {
    currency_tax: parseQty(form.currency_tax),
    billing_to_gl: form.billing_to_gl ? new Date(form.billing_to_gl).toISOString() : null,
  };
}

/** IDR amount = SO qty (MT) × price ($/MT) × Kurs IDR. */
export function computeBillingAmountIdr(
  qtyMt: number | null | undefined,
  priceUsdMt: number | null | undefined,
  kursIdr: number | null | undefined,
): number | null {
  if (qtyMt == null || priceUsdMt == null || kursIdr == null) return null;
  const q = Number(qtyMt);
  const p = Number(priceUsdMt);
  const k = Number(kursIdr);
  if (!Number.isFinite(q) || !Number.isFinite(p) || !Number.isFinite(k)) return null;
  if (q <= 0 || p <= 0 || k <= 0) return null;
  return Math.round(q * p * k);
}

/**
 * Compute BK / Levy IDR per SO from qty × Duty|Levy US$ × Kurs IDR.
 * Uses PR qty when available, otherwise invoice qty for the scoped SOs.
 */
export function allocatePaymentRequestAmounts(
  scopeLines: PaymentRequestOcrLineInput[],
  dutyUsdMt: number | null,
  levyUsdMt: number | null,
  currencyTax: number | null,
  qtyBySo: Map<string, number>,
): Map<string, { biaya_keluar_amount_idr: number | null; levy_amount_idr: number | null }> {
  const out = new Map<string, { biaya_keluar_amount_idr: number | null; levy_amount_idr: number | null }>();

  for (const line of scopeLines) {
    const qty =
      line.qty_mt != null && line.qty_mt > 0 ? line.qty_mt : (qtyBySo.get(line.so_no) ?? null);
    out.set(line.so_no, {
      biaya_keluar_amount_idr: computeBillingAmountIdr(qty, dutyUsdMt, currencyTax),
      levy_amount_idr: computeBillingAmountIdr(qty, levyUsdMt, currencyTax),
    });
  }

  return out;
}
