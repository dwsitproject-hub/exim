/**
 * billing-pdf-parser.ts
 *
 * Extracts billing fields from DJBC (Direktorat Jenderal Bea dan Cukai)
 * billing documents issued for export shipments.
 *
 * Supported document types:
 *   • biaya_keluar — "Bea Keluar" billing (export duty)
 *   • levy          — "Dana Sawit" levy billing
 *
 * Document structure (consistent across all DJBC billing PDFs):
 *   ──────────────────────────────────────────────────────
 *   KEMENTERIAN KEUANGAN REPUBLIK INDONESIA
 *   DIREKTORAT JENDERAL BEA DAN CUKAI
 *   ...
 *   Nomor Billing
 *   Tanggal <date>
 *   :
 *   :  Tgl Jt Tempo <date>
 *   <BILLING_NUMBER>          ← 15-digit numeric string
 *   ...
 *   Pembayaran
 *   Total
 *   <terbilang text>
 *   <AMOUNT>,<AMOUNT>   :     ← comma-formatted IDR total
 *   ──────────────────────────────────────────────────────
 *
 * The text layer is always present in these PDFs; no image OCR is required.
 */

import { extractPdfPageText } from "../../../shared/pdf-render.js";

export type BillingDocType = "biaya_keluar" | "levy";
export type BillingConfidence = "high" | "medium" | "low";

export interface BillingParseResult {
  billing_no: string | null;
  amount_idr: number | null;
  /** Human-readable string of amount, e.g. "12,948,438,000" */
  amount_idr_display: string | null;
  doc_type: BillingDocType;
  confidence: BillingConfidence;
  warnings: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse an Indonesian-formatted number string to a plain integer.
 * e.g. "12,948,438,000" → 12948438000
 */
function parseIdrString(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Field extraction ──────────────────────────────────────────────────────────

/**
 * Extract the Nomor Billing (billing number) from the raw PDF text.
 *
 * DJBC bills place the billing number on the line immediately following
 * the sequence: "Nomor Billing" → date line → ":" → "Tgl Jt Tempo..." → NUMBER
 *
 * The number is always a long purely-numeric string (≥12 digits).
 */
function extractBillingNo(text: string): string | null {
  // Split into lines, normalise whitespace
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  // Find the index of "Nomor Billing"
  const headerIdx = lines.findIndex((l) => /Nomor\s+Billing/i.test(l));
  if (headerIdx === -1) return null;

  // Scan the next 10 lines for a purely-numeric string of ≥12 digits
  const searchEnd = Math.min(headerIdx + 10, lines.length);
  for (let i = headerIdx + 1; i < searchEnd; i++) {
    const line = lines[i].trim();
    if (/^\d{12,}$/.test(line)) {
      return line;
    }
    // Also handle lines that contain the number among other tokens separated by tabs
    const tabParts = line.split(/\t+/).map((p) => p.trim());
    for (const part of tabParts) {
      if (/^\d{12,}$/.test(part)) return part;
    }
  }
  return null;
}

/**
 * Extract the Total IDR amount from the Pembayaran section.
 *
 * Pattern (from real DJBC docs):
 *   "Pembayaran\nTotal\n<terbilang text>\n<NUMBER,NUMBER>\t:"
 *   or
 *   "<NUMBER,NUMBER>\t:" (the total line itself)
 *
 * The amount appears on the line right after the "Terbilang" text and is
 * formatted with commas as thousand separators, e.g. "12,948,438,000".
 * It is always followed by whitespace + ":"
 */
function extractAmountIdr(text: string): string | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());

  // Find "Pembayaran" section
  const pembayaranIdx = lines.findIndex((l) => /Pembayaran/i.test(l));
  if (pembayaranIdx === -1) return null;

  // Scan lines after Pembayaran for a number matching IDR format
  // e.g. "12,948,438,000\t:" or "12,948,438,000  :"
  // Pattern: one or more groups of digits separated by commas, optionally followed by tab/space and ":"
  const amountPattern = /^([\d]{1,3}(?:,\d{3})+)\s*[:|\t]/;
  const searchEnd = Math.min(pembayaranIdx + 15, lines.length);

  for (let i = pembayaranIdx + 1; i < searchEnd; i++) {
    const line = lines[i];
    const m = amountPattern.exec(line);
    if (m) return m[1]; // e.g. "12,948,438,000"

    // Also handle tab-separated lines where the number is the last token before ":"
    const parts = line.split(/\t/).map((p) => p.trim());
    for (const part of parts) {
      if (/^[\d]{1,3}(?:,\d{3})+$/.test(part)) {
        // Check next token is ":" or line ends with ":"
        return part;
      }
    }
  }
  return null;
}

/**
 * Detect document type from the text content.
 * - BK (Biaya Keluar): contains "Bea Keluar" or account code "412211"
 * - Levy (Dana Sawit): contains "Dana Sawit" or account code "424138"
 */
function detectDocType(text: string): BillingDocType | null {
  if (/Dana\s+Sawit|424\d{3}/i.test(text)) return "levy";
  if (/Bea\s+Keluar|412\d{3}/i.test(text)) return "biaya_keluar";
  return null;
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse a DJBC billing PDF and extract structured fields.
 *
 * @param pdfPath  Absolute path to the PDF file on disk.
 * @param docType  Declared doc type from the frontend ("biaya_keluar" | "levy").
 *                 Used when auto-detection fails.
 */
export async function parseBillingPdf(
  pdfPath: string,
  docType: BillingDocType,
): Promise<BillingParseResult> {
  const warnings: string[] = [];

  // Extract text layer (DJBC PDFs always have an embedded text layer)
  const pageText = await extractPdfPageText(pdfPath, 0);

  if (!pageText || pageText.trim().length < 50) {
    warnings.push("Could not extract text from this PDF. The fields were not detected.");
    return {
      billing_no: null,
      amount_idr: null,
      amount_idr_display: null,
      doc_type: docType,
      confidence: "low",
      warnings,
    };
  }

  // Verify this looks like a DJBC billing document
  if (!/BILLING\s+DJBC|Bea\s+dan\s+Cukai/i.test(pageText)) {
    warnings.push(
      "This file does not appear to be a DJBC Billing document. Fields may not be extracted correctly.",
    );
  }

  // Auto-detect type and cross-check against declared type
  const detectedType = detectDocType(pageText);
  if (detectedType && detectedType !== docType) {
    warnings.push(
      `Document content appears to be a ${detectedType === "levy" ? "Levy (Dana Sawit)" : "Biaya Keluar (Bea Keluar)"} billing, ` +
        `but was uploaded as ${docType === "levy" ? "Levy" : "Biaya Keluar"}. Please verify.`,
    );
  }

  const billing_no = extractBillingNo(pageText);
  const amountRaw = extractAmountIdr(pageText);
  const amount_idr = amountRaw ? parseIdrString(amountRaw) : null;

  // Determine confidence
  let confidence: BillingConfidence = "high";
  if (!billing_no && !amount_idr) {
    confidence = "low";
    warnings.push("Could not extract Billing Number or Total Amount from this document.");
  } else if (!billing_no) {
    confidence = "medium";
    warnings.push("Billing Number was not detected — please enter it manually.");
  } else if (!amount_idr) {
    confidence = "medium";
    warnings.push("Total IDR Amount was not detected — please enter it manually.");
  }

  return {
    billing_no,
    amount_idr,
    amount_idr_display: amountRaw ?? null,
    doc_type: detectedType ?? docType,
    confidence,
    warnings,
  };
}
