/**
 * Soft-compare PIB draft OCR fields against shipment / PO mapping data.
 * Never blocks upload — returns warning records only.
 */

import type { ParsedPibFields } from "../../../shared/pib-pdf-parser.js";
import type { ShipmentRow } from "../dto/index.js";

export type PibOcrWarningSeverity = "mismatch" | "missing_ocr" | "missing_eos";

export interface PibOcrWarning {
  field: string;
  label: string;
  eos_value: string | null;
  ocr_value: string | null;
  severity: PibOcrWarningSeverity;
  message: string;
}

export interface PibOcrCompareInput {
  shipment: ShipmentRow;
  /** Invoice numbers from active linked PO mappings. */
  invoiceNos: string[];
  /** Currency rates from active linked PO mappings (non-null). */
  currencyRates: number[];
}

const NUM_ABS_TOL = 0.05;
const NUM_REL_TOL = 0.001;
const WEIGHT_MT_TOL = 0.0001;

function normStr(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s./&-]/g, "");
}

function fmt(v: string | number | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function numbersClose(a: number, b: number, absTol = NUM_ABS_TOL, relTol = NUM_REL_TOL): boolean {
  const diff = Math.abs(a - b);
  if (diff <= absTol) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff / scale <= relTol;
}

function portMatches(
  eosName: string | null,
  eosCode: string | null,
  ocrName: string | null,
  ocrCode: string | null
): boolean {
  const en = normStr(eosName);
  const ec = normStr(eosCode);
  const on = normStr(ocrName);
  const oc = normStr(ocrCode);
  if (ec && oc && ec === oc) return true;
  if (en && on && (en === on || en.includes(on) || on.includes(en))) return true;
  if (ec && on && on.includes(ec)) return true;
  if (en && oc && en.includes(oc)) return true;
  return false;
}

function invoiceMatches(eosInvoices: string[], ocrInvoice: string | null): boolean {
  if (!ocrInvoice) return false;
  const parts = ocrInvoice
    .split(/[&,;/]+/)
    .map((p) => normStr(p))
    .filter(Boolean);
  const eos = eosInvoices.map(normStr).filter(Boolean);
  if (eos.length === 0 || parts.length === 0) return false;
  // Pass if every EOS invoice appears in OCR parts, or OCR whole/parts covered by EOS.
  const ocrAll = normStr(ocrInvoice);
  if (eos.some((e) => ocrAll.includes(e) || e.includes(ocrAll))) return true;
  return eos.every((e) => parts.some((p) => p.includes(e) || e.includes(p)));
}

function pushCompare(
  warnings: PibOcrWarning[],
  field: string,
  label: string,
  eosRaw: string | null,
  ocrRaw: string | null,
  equal: boolean
): void {
  if (!eosRaw && !ocrRaw) return;
  if (!ocrRaw && eosRaw) {
    warnings.push({
      field,
      label,
      eos_value: eosRaw,
      ocr_value: null,
      severity: "missing_ocr",
      message: `${label}: not found on PIB document`,
    });
    return;
  }
  if (ocrRaw && !eosRaw) {
    warnings.push({
      field,
      label,
      eos_value: null,
      ocr_value: ocrRaw,
      severity: "missing_eos",
      message: `${label}: present on PIB but empty in EOS`,
    });
    return;
  }
  if (!equal) {
    warnings.push({
      field,
      label,
      eos_value: eosRaw,
      ocr_value: ocrRaw,
      severity: "mismatch",
      message: `${label}: EOS "${eosRaw}" ≠ PIB "${ocrRaw}"`,
    });
  }
}

export function comparePibOcrToShipment(
  extracted: ParsedPibFields,
  input: PibOcrCompareInput
): PibOcrWarning[] {
  const warnings: PibOcrWarning[] = [];
  const { shipment: s } = input;

  pushCompare(
    warnings,
    "origin_port",
    "Origin port",
    fmt(s.origin_port_name ?? s.origin_port_code),
    fmt(extracted.origin_port_name ?? extracted.origin_port_code),
    portMatches(
      s.origin_port_name,
      s.origin_port_code,
      extracted.origin_port_name,
      extracted.origin_port_code
    )
  );

  pushCompare(
    warnings,
    "destination_port",
    "Destination port",
    fmt(s.destination_port_name ?? s.destination_port_code),
    fmt(extracted.destination_port_name ?? extracted.destination_port_code),
    portMatches(
      s.destination_port_name,
      s.destination_port_code,
      extracted.destination_port_name,
      extracted.destination_port_code
    )
  );

  const eosPib = fmt(s.no_request_pib);
  const ocrPib = fmt(extracted.no_request_pib);
  pushCompare(
    warnings,
    "no_request_pib",
    "PIB Doc No",
    eosPib,
    ocrPib,
    !!eosPib && !!ocrPib && normStr(eosPib) === normStr(ocrPib)
  );

  const eosBl = fmt(s.bl_awb);
  const ocrBl = fmt(extracted.bl_awb);
  pushCompare(
    warnings,
    "bl_awb",
    "BL/AWB",
    eosBl,
    ocrBl,
    !!eosBl &&
      !!ocrBl &&
      (normStr(eosBl) === normStr(ocrBl) ||
        normStr(eosBl).includes(normStr(ocrBl)) ||
        normStr(ocrBl).includes(normStr(eosBl)))
  );

  const eosFreight = s.incoterm_amount != null ? Number(s.incoterm_amount) : null;
  const ocrFreight = extracted.freight;
  pushCompare(
    warnings,
    "freight",
    "Freight charge",
    fmt(eosFreight),
    fmt(ocrFreight),
    eosFreight != null && ocrFreight != null && numbersClose(eosFreight, ocrFreight)
  );

  const eosIns =
    (s as ShipmentRow & { insurance_amount?: number | null }).insurance_amount != null
      ? Number((s as ShipmentRow & { insurance_amount?: number | null }).insurance_amount)
      : null;
  const ocrIns = extracted.insurance_amount;
  pushCompare(
    warnings,
    "insurance_amount",
    "Insurance amount",
    fmt(eosIns),
    fmt(ocrIns),
    eosIns != null && ocrIns != null && numbersClose(eosIns, ocrIns)
  );

  const ocrNetMt = extracted.net_weight_kg != null ? extracted.net_weight_kg / 1000 : null;
  const eosNet = s.net_weight_mt != null ? Number(s.net_weight_mt) : null;
  pushCompare(
    warnings,
    "net_weight_mt",
    "Net weight (MT)",
    fmt(eosNet),
    fmt(ocrNetMt),
    eosNet != null && ocrNetMt != null && numbersClose(eosNet, ocrNetMt, WEIGHT_MT_TOL, NUM_REL_TOL)
  );

  const ocrGrossMt = extracted.gross_weight_kg != null ? extracted.gross_weight_kg / 1000 : null;
  const eosGross = s.gross_weight_mt != null ? Number(s.gross_weight_mt) : null;
  pushCompare(
    warnings,
    "gross_weight_mt",
    "Gross weight (MT)",
    fmt(eosGross),
    fmt(ocrGrossMt),
    eosGross != null &&
      ocrGrossMt != null &&
      numbersClose(eosGross, ocrGrossMt, WEIGHT_MT_TOL, NUM_REL_TOL)
  );

  const eosInv = input.invoiceNos.map((x) => x.trim()).filter(Boolean);
  const ocrInv = fmt(extracted.invoice_no);
  pushCompare(
    warnings,
    "invoice_no",
    "Invoice no.",
    eosInv.length ? eosInv.join(", ") : null,
    ocrInv,
    invoiceMatches(eosInv, extracted.invoice_no)
  );

  const eosRates = input.currencyRates.map(Number).filter((n) => Number.isFinite(n));
  const ocrRate = extracted.currency_rate;
  const rateOk =
    ocrRate != null && eosRates.some((r) => numbersClose(r, ocrRate, 0.01, NUM_REL_TOL));
  pushCompare(
    warnings,
    "currency_rate",
    "Currency rate (NDPBM)",
    eosRates.length ? eosRates.map(String).join(", ") : null,
    fmt(ocrRate),
    rateOk
  );

  const eosBm = s.bm != null ? Number(s.bm) : null;
  pushCompare(
    warnings,
    "bm",
    "BM (total)",
    fmt(eosBm),
    fmt(extracted.bm_total),
    eosBm != null && extracted.bm_total != null && numbersClose(eosBm, extracted.bm_total, 1, NUM_REL_TOL)
  );

  const eosPpn = s.ppn_amount != null ? Number(s.ppn_amount) : null;
  pushCompare(
    warnings,
    "ppn_amount",
    "PPN (total)",
    fmt(eosPpn),
    fmt(extracted.ppn_total),
    eosPpn != null &&
      extracted.ppn_total != null &&
      numbersClose(eosPpn, extracted.ppn_total, 1, NUM_REL_TOL)
  );

  const eosPph = s.pph_amount != null ? Number(s.pph_amount) : null;
  pushCompare(
    warnings,
    "pph_amount",
    "PPH (total)",
    fmt(eosPph),
    fmt(extracted.pph_total),
    eosPph != null &&
      extracted.pph_total != null &&
      numbersClose(eosPph, extracted.pph_total, 1, NUM_REL_TOL)
  );

  for (const w of extracted.warnings) {
    warnings.push({
      field: "parse",
      label: "Parse",
      eos_value: null,
      ocr_value: null,
      severity: "missing_ocr",
      message: w,
    });
  }

  return warnings;
}
