/**
 * PO PDF parser — runs Tesseract OCR on a rendered PDF page image and extracts
 * structured PO fields using regex heuristics tailored to Indonesian purchase orders.
 *
 * Supports two common layouts:
 *   - KPN / Coupa-style  (PT. CISADANE RAYA CHEMICALS, SAP/Coupa PO numbers)
 *   - Priscolin-style    (PT PRIMUS SANUS, direct PO number in header)
 *
 * All extracted values are suggestions — the user must review before submitting.
 */

import { createWorker } from "tesseract.js";
import { unlink } from "fs/promises";
import { join } from "path";
import { renderPdfPageToPng, getPdfPageCount, extractPdfPageText } from "./pdf-render.js";
import { PO_ITEM_UNIT_OPTION_SET } from "./po-item-units.js";
import { parseInternationalNumber } from "./csv-import-utils.js";
import { logger } from "../utils/logger.js";

/** Absolute path to tessdata directory — goes up two levels from src/shared/ to backend/tessdata/. */
const TESSDATA_DIR = join(__dirname, "..", "..", "tessdata");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedPoItem {
  item_description: string;
  qty: number;
  unit: string;
  /** Original unit string as read from the document before normalization. */
  unit_original: string;
  /** Unit price (value field in EOS). */
  value: number;
}

export interface ParsedPoResult {
  po_number: string | null;
  supplier_name: string | null;
  currency: string | null;
  incoterm_location: string | null;
  delivery_location: string | null;
  kawasan_berikat: "Yes" | "No" | null;
  pt: string | null;
  plant: string | null;
  items: ParsedPoItem[];
  warnings: string[];
  /** Short confidence label based on how many required fields were found. */
  confidence: "high" | "medium" | "low";
  /** First 1 000 chars of OCR text for debugging. */
  raw_text_preview: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CNF", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];

/** Ordered list of unambiguous 3-letter ISO currency codes to try first. */
const PRIORITY_CURRENCIES = ["USD", "EUR", "GBP", "SGD", "MYR", "CNY", "AUD", "THB", "JPY", "IDR"];

/** Maps OCR-read unit text → EOS unit codes. Case-insensitive compare. */
const UNIT_NORMALIZE: Record<string, string> = {
  piece: "PCS", pieces: "PCS", pce: "PCE", pc: "PC",
  pcs: "PCS", pcset: "PCSET", pcun: "PCUN",
  set: "SET", sets: "SETS",
  kg: "KG", kgs: "KGS", kgm: "KGM",
  kilogram: "KG", kilograms: "KG",
  mt: "MT", ton: "MT", tons: "MT", tonne: "MT", tonnes: "MT",
  m: "M", meter: "M", meters: "M", metre: "M", metres: "M",
  m2: "M2", sqm: "M2",
  l: "L", liter: "L", litre: "L", liters: "L", litres: "L",
  box: "BOX", boxes: "BOX",
  bag: "BAG", bags: "BAGS",
  roll: "ROLL", rolls: "ROLL",
  carton: "CARTONS", cartons: "CARTONS", ctn: "CTN",
  ct: "CT", cs: "CS",
  pallet: "PALLET", pallets: "PALLET",
  lot: "LOT", lots: "LOT",
  unit: "UNIT", units: "UNIT", un: "UNIT",
  pack: "PACK", pkg: "PKG", pk: "PK",
  cbm: "CBM", doz: "DOZ", niu: "NIU", oth: "OTH",
};

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Field extractors
// ---------------------------------------------------------------------------

function extractPoNumber(text: string): string | null {
  const patterns = [
    /Purchase\s+Order\s+#\s*([A-Z0-9][\w-]{3,})/i,
    /SAP\s+PO\s+No[.\s:+]+(\d{6,})/i,
    /PO\s+No(?:\.|\s*:|\s*=)?\s+([A-Z0-9][\w-]{3,})/i,
    /PO\s+Number[:\s]+([A-Z0-9][\w-]{3,})/i,
    /Purchase\s+Order\s+No[.\s:]+([A-Z0-9][\w-]{3,})/i,
    /\bDocument\s+No[.\s:]+(\d{8,})/i,
    /\b(\d{10})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function extractSupplierName(text: string): string | null {
  // "To : JJ-LURGI ENGINEERING SDN. BHD Delivery Date..." — stop before keywords
  // Extended stop-pattern: keywords that typically follow supplier name on same line
  const STOP_RE = /\s{2,}|\s+(?:Delivery|Address|NPWP|Phone|Fax|Email|PR\s+No|PO\s+(?:No|Date|Number))/i;
  // Accept ©/@/: as the separator after "TO" — OCR commonly misreads ":" as "©" or "@"
  const toPatterns = [
    /^To\s*[:\s©@]+([A-Z][A-Z0-9\s.,&()'-]{5,}?)(?:\s{2,}|$)/im,
    /^To\s*[:\s©@]+([^\n\r]{5,80})/im,
    /Vendor[:\s]+([A-Z][A-Z0-9\s.,&()'-]{5,80})/i,
  ];
  for (const p of toPatterns) {
    const m = text.match(p);
    if (m?.[1]) {
      let name = m[1].trim();
      const stopIdx = name.search(STOP_RE);
      if (stopIdx > 0) name = name.slice(0, stopIdx).trim();
      // Strip any leading OCR noise characters (©, @, punctuation) before the real name
      name = name.replace(/^[©@|:=+\s]+/, "").trim();
      // Remove trailing punctuation/symbols including em/en dashes from table borders
      name = name.replace(/[|:=+\-–—]+$/, "").trim();
      if (name.length >= 5) return name;
    }
  }
  return null;
}

/**
 * Currency extraction: prefer unambiguous 3-letter codes from table headers
 * (e.g. "Price (USD)", "Total (USD)") before scanning freeform text.
 * This avoids false positives like OCR artefacts being mistaken for "Rp".
 */
function extractCurrency(text: string): string | null {
  // Explicit "US$" or "US $" → USD (common on Indonesian POs)
  if (/\bUS\s*\$/.test(text)) return "USD";

  // "USS" is a common OCR misread of "USD" (e.g. "TOTAL uss 660.00")
  if (/\bUSS\b/i.test(text)) return "USD";

  // Highest confidence: currency in parentheses as column header
  const inParens = text.match(/\(\s*(USD|IDR|EUR|GBP|SGD|MYR|CNY|AUD|THB|JPY)\s*\)/i);
  if (inParens) return inParens[1].toUpperCase();

  // High confidence: "Total USD" / "Amount USD" on its own
  const colHeader = text.match(/(?:Total|Amount|Price|Value)\s+(USD|IDR|EUR|GBP|SGD|MYR|CNY|AUD|THB|JPY)\b/i);
  if (colHeader) return colHeader[1].toUpperCase();

  // Standalone ISO codes (avoid matching inside longer words with word-boundary check)
  for (const code of PRIORITY_CURRENCIES) {
    if (code === "IDR") {
      // IDR is the most ambiguous; only match as explicit standalone token
      if (/\bIDR\b/.test(text)) return "IDR";
      // "Rp" only if followed by a space or digit (not part of a word like "Corporate")
      if (/\bRp\.?\s*[\d(]/.test(text)) return "IDR";
      continue;
    }
    const re = new RegExp(`\\b${code}\\b`, "i");
    if (re.test(text)) return code;
  }
  return null;
}

function extractIncoterm(text: string): { code: string; location: string | null } | null {
  for (const term of INCOTERMS) {
    const re = new RegExp(`\\b${term}\\b`, "i");
    if (!re.test(text)) continue;

    // Try to find a port/location near the incoterm — look on the SAME line only.
    // "FOB PORT KLANG" or "FOB KARAWANG" (not "FOB - Free on Board").
    const sameLineRe = new RegExp(
      `\\b${term}\\b[\\s-–—]+(?:Free\\s+on\\s+Board[\\s-–—]*)?([A-Z][A-Z ]{2,29})(?:\\n|$)`,
      "im"
    );
    const sameLineM = text.match(sameLineRe);
    let location: string | null = null;
    if (sameLineM?.[1]) {
      const loc = sameLineM[1].trim();
      // Reject common incoterm description words and other non-port tokens
      const firstWord = loc.split(/\s+/)[0]?.toUpperCase() ?? "";
      const STOP = new Set(["LINE", "FREE", "BOARD", "TERMS", "DELIVERY", "PAYMENT", "ON", "CARRIER"]);
      if (!STOP.has(firstWord)) {
        location = loc;
      }
    }

    // Fallback: look for "Terms of Delivery : PORT KLANG" or "Delivery Location : ..."
    if (!location) {
      const termsM = text.match(
        /(?:Terms\s+of\s+Delivery|Delivery\s+Location|Port\s+of\s+(?:Loading|Destination))\s*[:\s]+([A-Z][A-Za-z ,.-]{2,40})/i
      );
      if (termsM?.[1]) location = termsM[1].trim();
    }

    return { code: term, location };
  }
  return null;
}

function extractDeliveryLocation(text: string, incotermCode: string | null, incotermLocation: string | null): string | null {
  if (incotermLocation) {
    // Return "FOB PORT KLANG" style combined string
    return incotermCode ? `${incotermCode} ${incotermLocation}`.trim() : incotermLocation;
  }

  const patterns = [
    /(?:Terms\s+of\s+Delivery|Delivery\s+Location|Delivery\s+Point|Ship\s+To|Port\s+of\s+(?:Loading|Discharge|Destination))\s*[:\s]+([A-Z][A-Za-z ,.-]{3,60})/i,
    /Plant\s+Location\s*[:\s]+([A-Z][A-Za-z ,.-]{3,40})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function detectKawasanBerikat(text: string): "Yes" | "No" | null {
  // Match explicit "Kawasan Berikat" phrase or "Bonded Zone" — not just "KB"
  // to avoid false positives from OCR artefacts
  if (/kawasan\s+berikat|bonded\s+zone/i.test(text)) return "Yes";
  return null;
}

function normalizeUnit(raw: string): { unit: string; mapped: boolean } {
  const upper = raw.trim().toUpperCase();
  if (PO_ITEM_UNIT_OPTION_SET.has(upper)) return { unit: upper, mapped: false };
  const normalized = UNIT_NORMALIZE[raw.trim().toLowerCase()];
  if (normalized) return { unit: normalized, mapped: true };
  return { unit: "OTH", mapped: true };
}

/**
 * Parse a quantity.
 * In EU-format documents (comma = decimal, period = thousands), "1,000" = 1.
 * In US/Indonesian-format documents, "174,000" = 174 000.
 */
function parseQty(raw: string, euFormat = false): number | null {
  if (euFormat) {
    const n = parseInternationalNumber(raw.trim());
    return n != null && Number.isFinite(n) && n > 0 ? n : null;
  }
  const t = raw.replace(/,/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Returns true when the text appears to use European decimal notation:
 * period as thousands separator and comma as decimal separator.
 * Matches patterns like "71.440,00" or "3.220,0000".
 */
function looksEuFormat(text: string): boolean {
  return /\d{1,3}\.\d{3},\d/.test(text);
}

/**
 * Parse a unit price: "163,0000" = 163.0000 (EU decimal), "560.00" = 560 (US).
 * Delegate to the shared international number parser.
 */
function parsePrice(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseInternationalNumber(t);
  return n != null && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Attempts to extract line items from OCR text.
 * Primary strategy: match "qty  UNIT  price" triplet on a row that contains
 * description text and numeric amounts.  Handles both full-row and split layouts.
 */
function extractItems(text: string): { items: ParsedPoItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const items: ParsedPoItem[] = [];

  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 3);

  // Find table header boundary (column header row)
  const headerIdx = lines.findIndex(
    (l) => /description|deskripsi|item|barang/i.test(l) && /qty|quantity|jumlah/i.test(l)
  );
  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
  const relevantLines = lines.slice(startIdx);

  // Skip lines that look like section footers/headers rather than item rows.
  // Use "continue" (not "break") so a "Total" or "Terms" line mid-document does not
  // prevent items on later pages from being parsed.
  const stopKeywords = /^(Total|Grand\s+Total|Subtotal|Terms|Notes?|Remarks?|Billing)/i;

  // Detect European number format (period=thousands, comma=decimal) once per document.
  const euFormat = looksEuFormat(text);

  // All unit keywords for matching — "UN" is the standard UN/ECE unit code for "one unit"
  const UNIT_RE_STR = [
    "PIECES?", "PCS?", "PCE", "PCSETS?", "PCUN",
    "SETS?", "KGS?", "KGM", "MT", "M2?",
    "UNITS?", "UN", "BAGS?", "BOX(?:ES)?", "CARTONS?", "CTN",
    "ROLL", "PALLETS?", "LOT", "PACK", "PKG", "CBM",
    "DOZ", "NIU", "OTH", "L",
  ].join("|");

  // Price capture: "([\d]+(?:[.,]\s*\d+)*)" captures EU prices like "71.440,0000"
  // as well as US prices like "71,440.00".  Spaces inside numbers (OCR artefact) are
  // allowed and stripped before parsing.
  const ITEM_RE = new RegExp(
    `^(?:\\d+\\s+)?(.{5,120}?)\\s+(\\d[\\d,.]*(?:\\.\\d+)?)\\s+(${UNIT_RE_STR})\\s+([\\d]+(?:[.,]\\s*\\d+)*)`,
    "i"
  );

  for (const rawLine of relevantLines) {
    if (stopKeywords.test(rawLine)) continue;
    // Normalize common OCR substitutions before matching:
    // "T.NNN" → "1.NNN"  (OCR misreads "1" as "T" in quantities like "1.000")
    // Remove spaces that OCR inserts inside numbers, e.g. "70.186, 0000" → "70.186,0000"
    const line = rawLine
      .replace(/\bT\.(\d{3,4})\b/g, "1.$1")
      .replace(/(\d[.,])\s+(\d)/g, "$1$2");
    const m = line.match(ITEM_RE);
    if (!m) continue;

    // Strip leading item-number and trailing dash/space artefacts from description
    const desc = m[1].replace(/^\d+\s+/, "").replace(/\s*[-–—]+\s*$/, "").trim();
    const qty = parseQty(m[2], euFormat);
    const unitRaw = m[3].trim();
    // Strip any trailing "/UNIT" suffix that may have been consumed after the price
    const priceRaw = m[4].replace(/\s*\/\s*\w+$/, "").trim();
    const price = parsePrice(priceRaw);

    if (!desc || qty == null || qty <= 0 || price == null || price < 0) continue;
    if (desc.length < 4) continue;

    const { unit, mapped } = normalizeUnit(unitRaw);
    if (mapped) {
      warnings.push(
        `Unit "${unitRaw}" was not in the allowed list — mapped to "${unit}". Please verify.`
      );
    }

    items.push({ item_description: desc, qty, unit, unit_original: unitRaw, value: price });
  }

  // Fallback: if we found nothing and text has "Item Description:" block, parse that
  if (items.length === 0) {
    const descMatch = text.match(/Item\s+Description\s*[:\s]+(.+?)(?:\n(?:Acct|Commodity|Need|Plant)|\n\n)/is);
    const qtyMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s+(PIECE|SET|KG|PCS|UNIT|BAG|ROLL|MT|CARTON|BOX)\b/i);
    const priceMatch = text.match(/Price\s*\(?\w{3}\)?\s*[:\s]*([\d,]+\.?\d{0,4})/i);

    if (descMatch?.[1] && qtyMatch && priceMatch) {
      const desc = descMatch[1].replace(/\s+/g, " ").trim();
      const qty = parseQty(qtyMatch[1]);
      const { unit, mapped } = normalizeUnit(qtyMatch[2]);
      const price = parsePrice(priceMatch[1]);

      if (desc && qty != null && qty > 0 && price != null && price >= 0) {
        if (mapped) {
          warnings.push(`Unit "${qtyMatch[2]}" mapped to "${unit}". Please verify.`);
        }
        items.push({ item_description: desc, qty, unit, unit_original: qtyMatch[2], value: price });
      }
    }
  }

  return { items, warnings };
}

// ---------------------------------------------------------------------------
// Confidence score
// ---------------------------------------------------------------------------

function scoreConfidence(result: Omit<ParsedPoResult, "confidence">): "high" | "medium" | "low" {
  let score = 0;
  if (result.po_number) score += 2;
  if (result.supplier_name) score += 2;
  if (result.currency) score += 1;
  if (result.incoterm_location) score += 1;
  if (result.items.length > 0) score += 2;
  if (result.delivery_location) score += 1;
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Parse a Purchase Order PDF using OCR and field extraction.
 *
 * @param pdfPath  Absolute path to the PDF file (temp file from multer).
 * @returns  Structured extracted fields + warnings. Does NOT create any DB records.
 */
/**
 * Maximum PDF pages to process per upload.
 * 15 pages covers the longest realistic PO while preventing runaway latency
 * if someone accidentally uploads a contract or T&C document.
 */
const MAX_OCR_PAGES = 15;

export async function parsePoPdf(pdfPath: string): Promise<ParsedPoResult> {
  const pngPaths: string[] = [];

  try {
    logger.info("PO PDF parse started", { pdf: pdfPath });

    const pageCount = await getPdfPageCount(pdfPath);
    const pagesToProcess = Math.min(pageCount, MAX_OCR_PAGES);

    /**
     * Minimum non-whitespace characters required to consider a page's embedded
     * text layer usable.  Pages below this threshold are assumed to be image-only
     * and are sent through the full OCR pipeline instead.
     */
    const TEXT_LAYER_MIN_CHARS = 150;

    const pageTexts: string[] = [];
    let ocrPageCount = 0;
    let textPageCount = 0;

    for (let i = 0; i < pagesToProcess; i++) {
      // Try the fast path: pull the embedded text layer directly.
      const embeddedText = await extractPdfPageText(pdfPath, i);
      const usableChars = embeddedText.replace(/\s/g, "").length;

      if (usableChars >= TEXT_LAYER_MIN_CHARS) {
        // PDF has a real text layer — use it verbatim (perfect quality, no OCR noise).
        pageTexts.push(embeddedText);
        textPageCount++;
        logger.debug("Using embedded text layer", { page: i, chars: usableChars });
      } else {
        // Image-only page — fall back to render → OCR.
        const png = await renderPdfPageToPng(pdfPath, i);
        pngPaths.push(png);
        pageTexts.push(await runOcr(png));
        ocrPageCount++;
        logger.debug("Using OCR (no text layer)", { page: i });
      }
    }

    const rawText = pageTexts.join("\n");
    logger.debug("Page processing complete", {
      pages: pagesToProcess,
      textPages: textPageCount,
      ocrPages: ocrPageCount,
      chars: rawText.length,
    });

    const warnings: string[] = [];

    const poNumber = extractPoNumber(rawText);
    if (!poNumber) warnings.push("PO number could not be detected from the document.");

    const supplierName = extractSupplierName(rawText);
    if (!supplierName) warnings.push("Supplier name could not be detected. Please fill manually.");

    const currency = extractCurrency(rawText);
    if (!currency) warnings.push("Currency could not be detected. Defaulting to USD.");

    const incotermResult = extractIncoterm(rawText);
    // incoterm_location stores just the 3-letter code (matches the frontend select options)
    const incotermLocation: string | null = incotermResult?.code ?? null;
    if (!incotermResult) warnings.push("Incoterm not detected. Please fill manually.");

    // delivery_location stores the port/place (optionally prefixed with incoterm code)
    const deliveryLocation = extractDeliveryLocation(
      rawText,
      incotermResult?.code ?? null,
      incotermResult?.location ?? null
    );
    if (!deliveryLocation) warnings.push("Delivery location not detected. Please fill manually.");

    const kawasanBerikat = detectKawasanBerikat(rawText);
    if (!kawasanBerikat) {
      warnings.push("Kawasan berikat status could not be determined. Please select manually.");
    }

    warnings.push("PT and Plant cannot be determined automatically. Please select from the form.");

    const { items, warnings: itemWarnings } = extractItems(rawText);
    warnings.push(...itemWarnings);
    if (items.length === 0) {
      warnings.push(
        "No line items could be extracted. The table layout may be complex — please enter items manually."
      );
    }

    const partial: Omit<ParsedPoResult, "confidence"> = {
      po_number: poNumber,
      supplier_name: supplierName,
      currency: currency ?? "USD",
      incoterm_location: incotermLocation,
      delivery_location: deliveryLocation,
      kawasan_berikat: kawasanBerikat,
      pt: null,
      plant: null,
      items,
      warnings,
      raw_text_preview: rawText.slice(0, 1000),
    };

    const confidence = scoreConfidence(partial);
    const result: ParsedPoResult = { ...partial, confidence };

    logger.info("PO PDF parse complete", {
      po_number: result.po_number,
      items: result.items.length,
      confidence,
      warnings: result.warnings.length,
    });

    return result;
  } finally {
    for (const p of pngPaths) await unlink(p).catch(() => undefined);
  }
}
