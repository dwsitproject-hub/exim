/**

 * Parses "Payment of Request - Levy or Duty Taxes" PDFs (PR documents).

 * Extracts shipment-level rates and per-SO billing codes; computes IDR amounts as qty × US$/MT × Kurs.

 */



import { extractPdfPageText, getPdfPageCount } from "../../../shared/pdf-render.js";



export type PaymentRequestConfidence = "high" | "medium" | "low";



export interface PaymentRequestLineResult {

  so_no: string;

  qty_mt: number | null;

  billing_code_duty: string | null;

  billing_code_levy: string | null;

  amount_duty_idr: number | null;

  amount_levy_idr: number | null;

}



export interface PaymentRequestParseResult {

  doc_type: "payment_of_request";

  pr_no: string | null;

  currency_tax: number | null;

  duty_usd_mt: number | null;

  levy_usd_mt: number | null;

  total_amount_duty: number | null;

  total_amount_levy: number | null;

  lines: PaymentRequestLineResult[];

  confidence: PaymentRequestConfidence;

  warnings: string[];

}



export interface PaymentRequestParseOptions {

  /** Invoice SO numbers — used to locate rows when table layout is fragmented in PDF text. */

  hintSos?: string[];

}



const BILLING_CODE_RE = /\b(\d{12,16})\b/g;

const SO_TOKEN_RE = /\b(\d{10,12})\b/;

const MAX_TABLE_LOOKAHEAD = 14;

const MAX_PAGES = 5;



function parseIdrString(raw: string): number | null {

  const cleaned = raw.replace(/,/g, "").trim();

  const n = parseInt(cleaned, 10);

  return Number.isFinite(n) && n > 0 ? n : null;

}



function parseDecimal(raw: string): number | null {

  const cleaned = raw.replace(/,/g, "").trim();

  const n = Number(cleaned);

  return Number.isFinite(n) && n > 0 ? n : null;

}



function parseQtyMt(raw: string): number | null {

  const cleaned = raw.replace(/,/g, "").trim();

  const n = Number(cleaned);

  return Number.isFinite(n) && n > 0 ? n : null;

}



function extractLabelValue(text: string, patterns: RegExp[]): string | null {

  for (const re of patterns) {

    const m = re.exec(text);

    if (m?.[1]) return m[1].trim();

  }

  return null;

}



function extractQtyFromSegment(segment: string): number | null {

  const qtyCandidates = [...segment.matchAll(/\b([\d]{1,3}(?:,\d{3})*(?:\.\d+)?)\b/g)].map((m) => m[1]);

  for (let i = qtyCandidates.length - 1; i >= 0; i--) {

    const q = parseQtyMt(qtyCandidates[i]);

    if (q != null && q >= 0.001) return q;

  }

  return null;

}



function collectBillingCodes(text: string): string[] {

  const seen = new Set<string>();

  const codes: string[] = [];

  for (const m of text.matchAll(BILLING_CODE_RE)) {

    const code = m[1];

    if (seen.has(code)) continue;

    seen.add(code);

    codes.push(code);

  }

  return codes;

}



function extractBillingPair(line: string): { duty: string; levy: string } | null {

  const billingCodes = collectBillingCodes(line);

  if (billingCodes.length < 2) return null;

  return { duty: billingCodes[0], levy: billingCodes[1] };

}



function soFromLine(line: string): string | null {

  const trimmed = line.trim();

  if (/^\d{10,12}$/.test(trimmed)) return trimmed;



  const rowOnly = trimmed.match(/^(\d{1,3})\s+(\d{10,12})\s*$/);

  if (rowOnly) return rowOnly[2];



  const rowInline = trimmed.match(/^(\d{1,3})\s+(\d{10,12})\b/);

  if (rowInline) return rowInline[2];



  return null;

}



function findTableBounds(lines: string[]): { start: number; end: number } {

  let end = lines.length;

  const amountIdx = lines.findIndex((l) => /^Amount\s+Duty/i.test(l));

  if (amountIdx >= 0) end = amountIdx;



  let start = 0;

  for (let i = 0; i < end; i++) {

    if (/SO\s*(No\.?|Number)|Nomor\s+SO|Sales\s*Order/i.test(lines[i])) {

      start = i + 1;

      break;

    }

  }

  if (start === 0) {

    for (let i = 0; i < end; i++) {

      if (/Qty\s*\(?\s*MT/i.test(lines[i])) {

        start = i + 1;

        break;

      }

    }

  }

  return { start, end };

}



function pushSoLine(

  results: Omit<PaymentRequestLineResult, "amount_duty_idr" | "amount_levy_idr">[],

  seenSo: Set<string>,

  soNo: string,

  qty_mt: number | null,

  billing_code_duty: string,

  billing_code_levy: string,

): void {

  if (seenSo.has(soNo)) return;

  seenSo.add(soNo);

  results.push({ so_no: soNo, qty_mt, billing_code_duty, billing_code_levy });

}



/** Extract table rows: SO number + optional qty + two billing codes (supports multi-line PDF text). */

function extractSoLines(

  text: string,

  hintSos?: string[],

): Omit<PaymentRequestLineResult, "amount_duty_idr" | "amount_levy_idr">[] {

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const results: Omit<PaymentRequestLineResult, "amount_duty_idr" | "amount_levy_idr">[] = [];

  const seenSo = new Set<string>();



  const { start, end } = findTableBounds(lines);

  const scanLines = lines.slice(start, end);



  // Strategy 1: multi-line window — SO on one line, billing codes on following lines (common PyMuPDF layout).

  for (let i = 0; i < scanLines.length; i++) {

    const soNo = soFromLine(scanLines[i]);

    if (!soNo || seenSo.has(soNo)) continue;



    const windowEnd = Math.min(i + MAX_TABLE_LOOKAHEAD, scanLines.length);

    const windowText = scanLines.slice(i, windowEnd).join(" ");

    const billingCodes = collectBillingCodes(windowText);

    if (billingCodes.length < 2) continue;



    const beforeDuty = windowText.slice(0, windowText.indexOf(billingCodes[0]));

    pushSoLine(results, seenSo, soNo, extractQtyFromSegment(beforeDuty), billingCodes[0], billingCodes[1]);

  }



  // Strategy 2: same-line SO + billing codes.

  for (let i = 0; i < scanLines.length; i++) {

    const line = scanLines[i];

    const pair = extractBillingPair(line);

    if (!pair) continue;



    const soMatch = line.match(SO_TOKEN_RE);

    if (!soMatch) continue;



    const soNo = soMatch[1];

    if (seenSo.has(soNo)) continue;



    const beforeDuty = line.slice(0, line.indexOf(pair.duty));

    pushSoLine(results, seenSo, soNo, extractQtyFromSegment(beforeDuty), pair.duty, pair.levy);

  }



  // Strategy 3: locate known invoice SOs in text and read billing codes from a nearby window.

  const hints = (hintSos ?? []).map((s) => s.trim()).filter(Boolean);

  for (const hint of hints) {

    if (seenSo.has(hint)) continue;

    const idx = text.indexOf(hint);

    if (idx < 0) continue;



    const windowText = text.slice(idx, idx + 900);

    const billingCodes = collectBillingCodes(windowText);

    if (billingCodes.length < 2) continue;



    const beforeDuty = windowText.slice(0, windowText.indexOf(billingCodes[0]));

    pushSoLine(results, seenSo, hint, extractQtyFromSegment(beforeDuty), billingCodes[0], billingCodes[1]);

  }



  // Strategy 4: flattened table scan when line breaks are unreliable.

  if (results.length === 0 && scanLines.length > 0) {

    const flat = scanLines.join(" ");

    for (const m of flat.matchAll(SO_TOKEN_RE)) {

      const soNo = m[1];

      if (seenSo.has(soNo)) continue;



      const after = flat.slice(m.index ?? 0, (m.index ?? 0) + 600);

      const billingCodes = collectBillingCodes(after);

      if (billingCodes.length < 2) continue;



      const beforeDuty = after.slice(0, after.indexOf(billingCodes[0]));

      pushSoLine(results, seenSo, soNo, extractQtyFromSegment(beforeDuty), billingCodes[0], billingCodes[1]);

    }

  }



  return results;

}



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



function allocateLineAmounts(

  lines: Omit<PaymentRequestLineResult, "amount_duty_idr" | "amount_levy_idr">[],

  dutyUsdMt: number | null,

  levyUsdMt: number | null,

  currencyTax: number | null,

): PaymentRequestLineResult[] {

  return lines.map((line) => ({

    ...line,

    amount_duty_idr: computeBillingAmountIdr(line.qty_mt, dutyUsdMt, currencyTax),

    amount_levy_idr: computeBillingAmountIdr(line.qty_mt, levyUsdMt, currencyTax),

  }));

}



/** Core parser — testable without a PDF file. */

export function parsePaymentRequestFromText(

  pageText: string,

  options?: PaymentRequestParseOptions,

): PaymentRequestParseResult {

  const warnings: string[] = [];

  const hintSos = options?.hintSos;



  if (!pageText || pageText.trim().length < 50) {

    warnings.push("Could not extract text from this PDF.");

    return {

      doc_type: "payment_of_request",

      pr_no: null,

      currency_tax: null,

      duty_usd_mt: null,

      levy_usd_mt: null,

      total_amount_duty: null,

      total_amount_levy: null,

      lines: [],

      confidence: "low",

      warnings,

    };

  }



  const normalized = pageText.replace(/\s+/g, " ");



  if (!/PAYMENT\s+OF\s+REQUEST|LEVY\s+OR\s+DUTY\s+TAXES/i.test(pageText)) {

    warnings.push(

      "This file does not appear to be a Payment of Request document. Fields may be incorrect.",

    );

  }



  const pr_no =

    extractLabelValue(pageText, [

      /\b(PR\d{2}-[A-Z0-9]+-\d{2}-\d+)\b/i,

      /PAYMENT\s+OF\s+REQUEST[^\n]*\n\s*([A-Z0-9-]{10,})/i,

    ]) ?? null;



  const kursRaw = extractLabelValue(pageText, [

    /Kurs\s*IDR\s*:?\s*([\d,]+)/i,

    /Kurs\s*IDR[\s\S]{0,40}?([\d,]+)/i,

  ]);

  const currency_tax = kursRaw ? parseDecimal(kursRaw) : null;



  const dutyUsdRaw = extractLabelValue(pageText, [

    /Duty\s*US\$?\s*:?\s*([\d,.]+)/i,

    /Duty\s*US\$[\s\S]{0,20}?([\d,.]+)/i,

  ]);

  const duty_usd_mt = dutyUsdRaw ? parseDecimal(dutyUsdRaw) : null;



  const levyUsdRaw = extractLabelValue(pageText, [

    /Levy\s*US\$?\s*:?\s*([\d,.]+)/i,

    /Levy\s*US\$[\s\S]{0,20}?([\d,.]+)/i,

  ]);

  const levy_usd_mt = levyUsdRaw ? parseDecimal(levyUsdRaw) : null;



  const amountDutyRaw = extractLabelValue(normalized, [

    /Amount\s+Duty\s*:?\s*([\d,]+)/i,

  ]);

  const total_amount_duty = amountDutyRaw ? parseIdrString(amountDutyRaw) : null;



  const amountLevyRaw = extractLabelValue(normalized, [

    /Amount\s+Levy\s*:?\s*([\d,]+)/i,

  ]);

  const total_amount_levy = amountLevyRaw ? parseIdrString(amountLevyRaw) : null;



  const rawLines = extractSoLines(pageText, hintSos);

  const lines = allocateLineAmounts(rawLines, duty_usd_mt, levy_usd_mt, currency_tax);



  if (rawLines.length === 0) {

    warnings.push("No SO rows with billing codes were detected in the table.");

  }

  if (rawLines.some((l) => l.qty_mt == null) && duty_usd_mt != null && levy_usd_mt != null && currency_tax != null) {

    warnings.push(

      "Some SO quantities were not detected — per-SO IDR amounts may need manual entry.",

    );

  }

  if (currency_tax == null) warnings.push("Kurs IDR (Currency Tax) was not detected.");

  if (duty_usd_mt == null) warnings.push("Duty US$ was not detected.");

  if (levy_usd_mt == null) warnings.push("Levy US$ was not detected.");



  const hasCore =

    currency_tax != null &&

    duty_usd_mt != null &&

    levy_usd_mt != null &&

    lines.length > 0 &&

    lines.every((l) => l.billing_code_duty && l.billing_code_levy);



  let confidence: PaymentRequestConfidence = "high";

  if (!hasCore) confidence = "low";

  else if (warnings.length > 0) confidence = "medium";



  return {

    doc_type: "payment_of_request",

    pr_no,

    currency_tax,

    duty_usd_mt,

    levy_usd_mt,

    total_amount_duty,

    total_amount_levy,

    lines,

    confidence,

    warnings,

  };

}



async function extractAllPagesText(pdfPath: string): Promise<string> {

  const pageCount = Math.min(await getPdfPageCount(pdfPath), MAX_PAGES);

  const parts: string[] = [];

  for (let page = 0; page < pageCount; page++) {

    const text = await extractPdfPageText(pdfPath, page);

    if (text.trim()) parts.push(text);

  }

  return parts.join("\n");

}



export async function parsePaymentRequestPdf(

  pdfPath: string,

  options?: PaymentRequestParseOptions,

): Promise<PaymentRequestParseResult> {

  const pageText = await extractAllPagesText(pdfPath);

  return parsePaymentRequestFromText(pageText, options);

}


