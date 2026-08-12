/**
 * PIB (BC 2.0 / BC 2.3) PDF field extraction for draft verification.
 * Prefers embedded text layer; falls back to Tesseract OCR when text is sparse.
 */

import { createWorker } from "tesseract.js";
import { unlink } from "fs/promises";
import { join } from "path";
import { renderPdfPageToPng, getPdfPageCount, extractPdfPageText } from "./pdf-render.js";
import { parseInternationalNumber } from "./csv-import-utils.js";
import { logger } from "../utils/logger.js";

export type PibFormType = "BC_20" | "BC_23" | "UNKNOWN";

export interface ParsedPibFields {
  form_type: PibFormType;
  origin_port_name: string | null;
  origin_port_code: string | null;
  destination_port_name: string | null;
  destination_port_code: string | null;
  no_request_pib: string | null;
  bl_awb: string | null;
  freight: number | null;
  insurance_amount: number | null;
  net_weight_kg: number | null;
  gross_weight_kg: number | null;
  invoice_no: string | null;
  currency_rate: number | null;
  bm_total: number | null;
  ppn_total: number | null;
  pph_total: number | null;
  warnings: string[];
  confidence: "high" | "medium" | "low";
  raw_text_preview: string;
}

const TESSDATA_DIR = join(__dirname, "..", "..", "tessdata");
const MAX_OCR_PAGES = 8;
const TEXT_LAYER_MIN_CHARS = 120;

const PORT_CODE_RE = /^[A-Z]{2}[A-Z0-9]{3}$/;
const NOMOR_PENGAJUAN_RE = /\b0000\d{2}[A-Z0-9]{18,}\b/;

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function parseNum(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const cleaned = String(raw).replace(/[Rr][Pp]\s*/g, "").trim();
  if (!cleaned) return null;
  // US/ID thousands: 30,109,000 or 1,841,790.00 — strip grouping commas.
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(cleaned)) {
    const n = Number(cleaned.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = parseInternationalNumber(cleaned);
  return n != null && Number.isFinite(n) ? n : null;
}

async function runOcr(imagePath: string): Promise<string> {
  const worker = await createWorker("eng", 1, {
    logger: () => undefined,
    cachePath: TESSDATA_DIR,
    langPath: TESSDATA_DIR,
  });
  try {
    const { data } = await worker.recognize(imagePath);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

async function extractPdfText(pdfPath: string): Promise<string> {
  const pngPaths: string[] = [];
  try {
    const pageCount = await getPdfPageCount(pdfPath);
    const pagesToProcess = Math.min(pageCount, MAX_OCR_PAGES);
    const pageTexts: string[] = [];

    for (let i = 0; i < pagesToProcess; i++) {
      const embeddedText = await extractPdfPageText(pdfPath, i);
      const usableChars = embeddedText.replace(/\s/g, "").length;

      if (usableChars >= TEXT_LAYER_MIN_CHARS) {
        pageTexts.push(embeddedText);
      } else {
        const png = await renderPdfPageToPng(pdfPath, i);
        pngPaths.push(png);
        pageTexts.push(await runOcr(png));
      }
    }
    return pageTexts.join("\n");
  } finally {
    for (const p of pngPaths) await unlink(p).catch(() => undefined);
  }
}

function detectFormType(text: string): PibFormType {
  if (/\bBC\s*2\.3\b/i.test(text) || /TEMPAT PENIMBUNAN BERIKAT/i.test(text)) return "BC_23";
  if (/\bBC\s*2\.0\b/i.test(text) || /PEMBERITAHUAN IMPOR BARANG \(PIB\)/i.test(text)) return "BC_20";
  return "UNKNOWN";
}

function extractNomorPengajuan(text: string): string | null {
  const m = text.match(NOMOR_PENGAJUAN_RE);
  return m?.[0] ?? null;
}

function extractPortsBc20(text: string): {
  origin_port_name: string | null;
  origin_port_code: string | null;
  destination_port_name: string | null;
  destination_port_code: string | null;
} {
  const m = text.match(
    /12\.\s*Pelabuhan Muat\s*:?\s*\n([^\n]+)\n([^\n]+)\n([^\n]+)\n([^\n]+)/i
  );
  if (m) {
    const a = m[1]!.trim();
    const b = m[2]!.trim();
    const c = m[3]!.trim();
    const d = m[4]!.trim();
    if (PORT_CODE_RE.test(b) && PORT_CODE_RE.test(d)) {
      return {
        origin_port_name: a,
        origin_port_code: b,
        destination_port_name: c,
        destination_port_code: d,
      };
    }
  }
  return {
    origin_port_name: null,
    origin_port_code: null,
    destination_port_name: null,
    destination_port_code: null,
  };
}

function extractPortsBc23(text: string): {
  origin_port_name: string | null;
  origin_port_code: string | null;
  destination_port_name: string | null;
  destination_port_code: string | null;
} {
  const m = text.match(
    /13\.\s*Pelabuhan Muat[\s\S]{0,80}?15\.\s*Pelabuhan\s*\n([A-Z]{2}[A-Z0-9]{3})\n([A-Z]{2}[A-Z0-9]{3})\n([^\n]+)\n([^\n]+)/i
  );
  if (m) {
    return {
      origin_port_code: m[1]!.trim(),
      destination_port_code: m[2]!.trim(),
      destination_port_name: m[3]!.trim(),
      origin_port_name: m[4]!.trim(),
    };
  }
  return {
    origin_port_name: null,
    origin_port_code: null,
    destination_port_name: null,
    destination_port_code: null,
  };
}

function isPlausibleNdpm(raw: string, n: number | null): boolean {
  if (n == null || n <= 0) return false;
  // Reject next-field leftovers like "9." from "9. Cara Pengangkutan".
  if (/^\d{1,2}\.?$/.test(raw.trim())) return false;
  return n >= 100 || /^\d+[.,]\d+/.test(raw.trim());
}

function extractNdpm(text: string): number | null {
  const labeled =
    text.match(/24\.\s*NDPBM\s*:?\s*\n([\d.,]+)/i) ?? text.match(/NDPBM\s*:?\s*\n([\d.,]+)/i);
  if (labeled) {
    const n = parseNum(labeled[1]);
    if (isPlausibleNdpm(labeled[1]!, n)) return n;
  }
  const block = text.match(
    /(?:YUAN RENMINBI|US DOLLAR|EURO|SINGAPORE DOLLAR)\n([\d.,]+)\n([\d.,]+)\n([\d.,]+)\n([\d.,]+)/i
  );
  if (block) {
    const n = parseNum(block[1]);
    if (isPlausibleNdpm(block[1]!, n)) return n;
  }
  return null;
}

function extractFreightInsuranceBc20(text: string): { freight: number | null; insurance: number | null } {
  const block = text.match(
    /(?:YUAN RENMINBI|US DOLLAR|EURO|SINGAPORE DOLLAR)\n([\d.,]+)\n([\d.,]+)\n([\d.,]+)\n([\d.,]+)/i
  );
  if (block) {
    return { freight: parseNum(block[3]), insurance: parseNum(block[4]) };
  }
  return { freight: null, insurance: null };
}

function extractFreightInsuranceBc23(text: string): { freight: number | null; insurance: number | null } {
  const m = text.match(
    /27\.\s*Asuransi\s*LN\/DN\s*:?\s*\n?26\.\s*Freight\s*\n([\d.,]+)\n([\d.,]+)\n([\d.,]+)/i
  );
  if (m) {
    return { insurance: parseNum(m[1]), freight: parseNum(m[2]) };
  }
  const m2 = text.match(/26\.\s*Freight\s*\n([\d.,]+)\n([\d.,]+)\n([\d.,]+)/i);
  if (m2) {
    return { insurance: parseNum(m2[1]), freight: parseNum(m2[2]) };
  }
  return { freight: null, insurance: null };
}

function extractWeightsBc20(text: string): { gross_kg: number | null; net_kg: number | null } {
  const afterValuta = text.match(
    /(?:YUAN RENMINBI|US DOLLAR|EURO|SINGAPORE DOLLAR)[\s\S]{0,400}?(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)\n(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+)\n\s*31\./i
  );
  if (afterValuta) {
    return { gross_kg: parseNum(afterValuta[1]), net_kg: parseNum(afterValuta[2]) };
  }
  const m = text.match(
    /(\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?|\d+\.\d{1,4})\n(\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?|\d+\.\d{1,4})\n\s*31\./
  );
  if (m) return { gross_kg: parseNum(m[1]), net_kg: parseNum(m[2]) };
  return { gross_kg: null, net_kg: null };
}

function extractWeightsBc23(text: string): { gross_kg: number | null; net_kg: number | null } {
  const m = text.match(
    /31\.\s*Berat Kotor\s*\(Kg\)\s*:?\s*\n?\s*32\.\s*Berat Bersih\s*\(Kg\)\s*:?\s*\n([\d.,]+)\n([\d.,]+)/i
  );
  if (m) return { gross_kg: parseNum(m[1]), net_kg: parseNum(m[2]) };
  return { gross_kg: null, net_kg: null };
}

function extractInvoice(text: string): string | null {
  const lampiran = text.match(/INVOICE\s*\nNo\.\s*([^\n]+)/i);
  if (lampiran) return normalizeWs(lampiran[1]!.replace(/\s*Tgl\..*$/i, ""));
  const lampiran2 = text.match(/\bINVOICE\n([A-Z0-9][A-Z0-9&\/*._-]{2,})\n/i);
  if (lampiran2) return normalizeWs(lampiran2[1]!);
  const m = text.match(/16\.\s*Invoice[\s\S]{0,200}?([A-Z0-9][A-Z0-9&\/*._-]{3,})\s*\nTgl\./i);
  if (m) return normalizeWs(m[1]!);
  return null;
}

function looksLikeDocNo(s: string): boolean {
  const t = s.trim();
  if (!t || /^\d{2}-\d{2}-\d{4}$/.test(t)) return false;
  if (/^Tgl/i.test(t)) return false;
  return /^[A-Z0-9][A-Z0-9&\/*._-]{3,}$/i.test(t);
}

function extractBlAwb(text: string): string | null {
  const bl = text.match(/(?:^|\n)B\/L\nNo\.\s*([^\n]+)/i);
  if (bl) {
    const v = normalizeWs(bl[1]!.replace(/\s*Tgl\..*$/i, ""));
    if (looksLikeDocNo(v)) return v;
  }
  const awb = text.match(/(?:^|\n)AWB\n([^\n]+)\n/i);
  if (awb) {
    const v = normalizeWs(awb[1]!);
    if (looksLikeDocNo(v)) return v;
  }
  const bl2 = text.match(/(?:^|\n)B\/L\n([^\n]+)\n/i);
  if (bl2) {
    const v = normalizeWs(bl2[1]!);
    if (looksLikeDocNo(v)) return v;
  }
  return null;
}

function extractDutiesBc20(text: string): { bm: number | null; ppn: number | null; pph: number | null } {
  const idx = text.search(/\bTOTAL\b/);
  if (idx < 0) return { bm: null, ppn: null, pph: null };
  const after = text.slice(idx, idx + 500);
  const nums = [...after.matchAll(/([\d.,]+)/g)]
    .map((x) => parseNum(x[1]))
    .filter((n): n is number => n != null);

  let ppn: number | null = null;
  let pph: number | null = null;
  for (const n of nums) {
    if (n >= 1000) {
      if (ppn == null) ppn = n;
      else if (pph == null) {
        pph = n;
        break;
      }
    }
  }
  const bmBlock = text.match(/\nBM\n[\s\S]{0,200}?([\d.,]+)/);
  const bm = bmBlock ? parseNum(bmBlock[1]) : 0;
  return { bm: bm ?? 0, ppn, pph };
}

function extractDutiesBc23(text: string): { bm: number | null; ppn: number | null; pph: number | null } {
  // Prefer Ditangguhkan column footer (PPN + PPH ≈ TOTAL).
  const ditIdx = text.search(/Ditangguhkan\s*\(Rp\)/i);
  const slice = ditIdx >= 0 ? text.slice(ditIdx, ditIdx + 600) : text.slice(-800);
  const nums = [...slice.matchAll(/\b(\d{1,3}(?:,\d{3})+)\b/g)]
    .map((x) => parseNum(x[1]))
    .filter((n): n is number => n != null && n >= 1000);
  if (nums.length < 3) return { bm: 0, ppn: null, pph: null };
  for (let i = nums.length - 1; i >= 2; i--) {
    const total = nums[i]!;
    const b = nums[i - 1]!;
    const a = nums[i - 2]!;
    if (b < 1000) continue;
    if (Math.abs(a + b - total) <= 2) {
      return { bm: 0, ppn: a, pph: b };
    }
  }
  return { bm: 0, ppn: null, pph: null };
}

function countFilled(
  fields: Omit<ParsedPibFields, "warnings" | "confidence" | "raw_text_preview" | "form_type">
): number {
  let n = 0;
  for (const v of Object.values(fields)) {
    if (v != null && v !== "") n++;
  }
  return n;
}

export function parsePibText(rawText: string): ParsedPibFields {
  // Normalize CRLF so `\n`-anchored patterns and `\s*` do not fight line endings.
  const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const warnings: string[] = [];
  const form_type = detectFormType(text);
  const no_request_pib = extractNomorPengajuan(text);
  const ports = form_type === "BC_23" ? extractPortsBc23(text) : extractPortsBc20(text);
  const currency_rate = extractNdpm(text);
  const fi =
    form_type === "BC_23" ? extractFreightInsuranceBc23(text) : extractFreightInsuranceBc20(text);
  const weights = form_type === "BC_23" ? extractWeightsBc23(text) : extractWeightsBc20(text);
  const invoice_no = extractInvoice(text);
  const bl_awb = extractBlAwb(text);
  const duties = form_type === "BC_23" ? extractDutiesBc23(text) : extractDutiesBc20(text);

  const core = {
    origin_port_name: ports.origin_port_name,
    origin_port_code: ports.origin_port_code,
    destination_port_name: ports.destination_port_name,
    destination_port_code: ports.destination_port_code,
    no_request_pib,
    bl_awb,
    freight: fi.freight,
    insurance_amount: fi.insurance,
    net_weight_kg: weights.net_kg,
    gross_weight_kg: weights.gross_kg,
    invoice_no,
    currency_rate,
    bm_total: duties.bm,
    ppn_total: duties.ppn,
    pph_total: duties.pph,
  };

  const filled = countFilled(core);
  if (!no_request_pib) warnings.push("Could not extract Nomor Pengajuan");
  if (!ports.origin_port_name && !ports.origin_port_code) warnings.push("Could not extract origin port");
  if (!invoice_no) warnings.push("Could not extract invoice number");
  if (filled < 6) warnings.push("Low field coverage from PIB PDF");

  const confidence: ParsedPibFields["confidence"] =
    filled >= 10 ? "high" : filled >= 6 ? "medium" : "low";

  return {
    form_type,
    ...core,
    warnings,
    confidence,
    raw_text_preview: text.slice(0, 2000),
  };
}

export async function parsePibPdf(pdfPath: string): Promise<ParsedPibFields> {
  try {
    const text = await extractPdfText(pdfPath);
    if (!text || text.replace(/\s/g, "").length < 80) {
      return {
        form_type: "UNKNOWN",
        origin_port_name: null,
        origin_port_code: null,
        destination_port_name: null,
        destination_port_code: null,
        no_request_pib: null,
        bl_awb: null,
        freight: null,
        insurance_amount: null,
        net_weight_kg: null,
        gross_weight_kg: null,
        invoice_no: null,
        currency_rate: null,
        bm_total: null,
        ppn_total: null,
        pph_total: null,
        warnings: ["PIB PDF produced insufficient text for extraction"],
        confidence: "low",
        raw_text_preview: text?.slice(0, 500) ?? "",
      };
    }
    return parsePibText(text);
  } catch (err) {
    logger.error("PIB PDF parse failed", { err, pdfPath });
    return {
      form_type: "UNKNOWN",
      origin_port_name: null,
      origin_port_code: null,
      destination_port_name: null,
      destination_port_code: null,
      no_request_pib: null,
      bl_awb: null,
      freight: null,
      insurance_amount: null,
      net_weight_kg: null,
      gross_weight_kg: null,
      invoice_no: null,
      currency_rate: null,
      bm_total: null,
      ppn_total: null,
      pph_total: null,
      warnings: [`PIB parse error: ${err instanceof Error ? err.message : String(err)}`],
      confidence: "low",
      raw_text_preview: "",
    };
  }
}
