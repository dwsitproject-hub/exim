/**
 * PO PDF parser — OCR/text layer + template-aware regex + optional Claude assist.
 */

import { createWorker } from "tesseract.js";
import { unlink } from "fs/promises";
import { join } from "path";
import { renderPdfPageToPng, getPdfPageCount, extractPdfPageText } from "./pdf-render.js";
import { normalizeUnit } from "./po-unit-normalize.js";
import { parseInternationalNumber } from "./csv-import-utils.js";
import { logger } from "../utils/logger.js";
import {
  analyzeItemCompleteness,
  completenessWarning,
  resolveCompletenessAfterAi,
  type ItemCompleteness,
} from "./po-pdf-completeness.js";
import { matchTemplate } from "./po-pdf-template.js";
import { claudeExtractFromPdf } from "./claude-po-extract.js";
import { PoDocumentTemplateRepository } from "../modules/po-intake/repositories/po-document-template.repository.js";
import type { PoDocumentTemplateRow } from "../modules/po-intake/repositories/po-document-template.repository.js";
import {
  PoPdfAiUsageRepository,
  PoPdfAiRequestRepository,
} from "../modules/po-intake/repositories/index.js";
import { config } from "../config/index.js";

const TESSDATA_DIR = join(__dirname, "..", "..", "tessdata");
const MAX_OCR_PAGES = 15;
const TEXT_LAYER_MIN_CHARS = 150;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedPoItem {
  item_description: string;
  qty: number;
  unit: string;
  unit_original: string;
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
  confidence: "high" | "medium" | "low";
  raw_text_preview: string;
  expected_item_count: number | null;
  item_completeness: ItemCompleteness;
  template_code: string | null;
  ai_assisted: boolean;
  /** True when user may invoke AI once for this file (Claude enabled and quota remaining). */
  ai_available: boolean;
  /** Why AI is unavailable when ai_available is false. */
  ai_unavailable_reason?: PoPdfAiUnavailableReason | null;
  /** Set when this response used AI — confidence level before AI merge (for UI). */
  confidence_before?: "high" | "medium" | "low" | null;
}

export type PoPdfAiUnavailableReason =
  | "claude_disabled"
  | "missing_api_key"
  | "quota_used"
  | "missing_session"
  | "high_confidence";

export interface ParsePoPdfOptions {
  contentHash?: string;
  userId?: string;
  originalFilename?: string;
  /** When true, run Claude PDF extract if gates allow. Default false — user triggers via UI button. */
  requestAi?: boolean;
}

export interface ParseTemplateConfig {
  numberFormat: "us" | "eu" | "auto";
  fieldPatterns?: {
    po_number?: string[];
    supplier?: string[];
  };
  itemRowPattern?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CNF", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const PRIORITY_CURRENCIES = ["USD", "EUR", "GBP", "SGD", "MYR", "CNY", "AUD", "THB", "JPY", "IDR"];

const DEFAULT_PO_PATTERNS = [
  /Purchase\s+Order\s+#\s*([A-Z0-9][\w-]{3,})/i,
  /SAP\s+PO\s+No[.\s:+]+(\d{6,})/i,
  /PO\s+No(?:\.|\s*:|\s*=)?\s+([A-Z0-9][\w-]{3,})/i,
  /PO\s+Number[:\s]+([A-Z0-9][\w-]{3,})/i,
  /Purchase\s+Order\s+No[.\s:]+([A-Z0-9][\w-]{3,})/i,
  /\bDocument\s+No[.\s:]+(\d{8,})/i,
  /\b(\d{10})\b/,
];

const DEFAULT_SUPPLIER_PATTERNS = [
  /^To\s*[:\s©@]+([A-Z][A-Z0-9\s.,&()'-]{5,}?)(?:\s{2,}|$)/im,
  /^To\s*[:\s©@]+([^\n\r]{5,80})/im,
  /Vendor[:\s]+([A-Z][A-Z0-9\s.,&()'-]{5,80})/i,
];

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

export interface OcrTextResult {
  text: string;
  pageCount: number;
  truncated: boolean;
}

export async function extractOcrTextFromPdf(pdfPath: string): Promise<OcrTextResult> {
  const pngPaths: string[] = [];
  try {
    const pageCount = await getPdfPageCount(pdfPath);
    const pagesToProcess = Math.min(pageCount, MAX_OCR_PAGES);
    const truncated = pageCount > MAX_OCR_PAGES;
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
    return { text: pageTexts.join("\n"), pageCount, truncated };
  } finally {
    for (const p of pngPaths) await unlink(p).catch(() => undefined);
  }
}

function templateToConfig(template: PoDocumentTemplateRow | null): ParseTemplateConfig | undefined {
  if (!template) return undefined;
  return {
    numberFormat: template.number_format,
    fieldPatterns: template.field_patterns,
    itemRowPattern: template.item_row_pattern,
  };
}

// ---------------------------------------------------------------------------
// Field extractors
// ---------------------------------------------------------------------------

function patternsFromStrings(strings: string[] | undefined): RegExp[] {
  if (!strings?.length) return [];
  const out: RegExp[] = [];
  for (const s of strings) {
    try {
      out.push(new RegExp(s, "im"));
    } catch {
      logger.warn("Invalid template regex skipped", { pattern: s });
    }
  }
  return out;
}

function extractPoNumber(text: string, tpl?: ParseTemplateConfig): string | null {
  const custom = patternsFromStrings(tpl?.fieldPatterns?.po_number);
  const patterns = custom.length > 0 ? custom : DEFAULT_PO_PATTERNS;
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function extractSupplierName(text: string, tpl?: ParseTemplateConfig): string | null {
  const STOP_RE = /\s{2,}|\s+(?:Delivery|Address|NPWP|Phone|Fax|Email|PR\s+No|PO\s+(?:No|Date|Number))/i;
  const custom = patternsFromStrings(tpl?.fieldPatterns?.supplier);
  const patterns = custom.length > 0 ? custom : DEFAULT_SUPPLIER_PATTERNS;

  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      let name = m[1].trim();
      const stopIdx = name.search(STOP_RE);
      if (stopIdx > 0) name = name.slice(0, stopIdx).trim();
      name = name.replace(/^[©@|:=+\s]+/, "").trim();
      name = name.replace(/[|:=+\-–—]+$/, "").trim();
      if (name.length >= 5) return name;
    }
  }
  return null;
}

function extractCurrency(text: string): string | null {
  if (/\bUS\s*\$/.test(text)) return "USD";
  if (/\bUSS\b/i.test(text)) return "USD";
  const inParens = text.match(/\(\s*(USD|IDR|EUR|GBP|SGD|MYR|CNY|AUD|THB|JPY)\s*\)/i);
  if (inParens) return inParens[1].toUpperCase();
  const colHeader = text.match(/(?:Total|Amount|Price|Value)\s+(USD|IDR|EUR|GBP|SGD|MYR|CNY|AUD|THB|JPY)\b/i);
  if (colHeader) return colHeader[1].toUpperCase();
  for (const code of PRIORITY_CURRENCIES) {
    if (code === "IDR") {
      if (/\bIDR\b/.test(text)) return "IDR";
      if (/\bRp\.?\s*[\d(]/.test(text)) return "IDR";
      continue;
    }
    if (new RegExp(`\\b${code}\\b`, "i").test(text)) return code;
  }
  return null;
}

function extractIncoterm(text: string): { code: string; location: string | null } | null {
  for (const term of INCOTERMS) {
    const re = new RegExp(`\\b${term}\\b`, "i");
    if (!re.test(text)) continue;
    const sameLineRe = new RegExp(
      `\\b${term}\\b[\\s-–—]+(?:Free\\s+on\\s+Board[\\s-–—]*)?([A-Z][A-Z ]{2,29})(?:\\n|$)`,
      "im"
    );
    const sameLineM = text.match(sameLineRe);
    let location: string | null = null;
    if (sameLineM?.[1]) {
      const loc = sameLineM[1].trim();
      const firstWord = loc.split(/\s+/)[0]?.toUpperCase() ?? "";
      const STOP = new Set(["LINE", "FREE", "BOARD", "TERMS", "DELIVERY", "PAYMENT", "ON", "CARRIER"]);
      if (!STOP.has(firstWord)) location = loc;
    }
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

function extractDeliveryLocation(
  text: string,
  incotermCode: string | null,
  incotermLocation: string | null
): string | null {
  if (incotermLocation) {
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
  if (/kawasan\s+berikat|bonded\s+zone/i.test(text)) return "Yes";
  return null;
}

function resolveEuFormat(text: string, tpl?: ParseTemplateConfig): boolean {
  if (tpl?.numberFormat === "eu") return true;
  if (tpl?.numberFormat === "us") return false;
  return looksEuFormat(text);
}

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

function looksEuFormat(text: string): boolean {
  return /\d{1,3}\.\d{3},\d/.test(text);
}

function parsePrice(raw: string): number | null {
  const n = parseInternationalNumber(raw.trim());
  return n != null && Number.isFinite(n) && n >= 0 ? n : null;
}

function buildDefaultItemRe(): RegExp {
  const UNIT_RE_STR = [
    "PIECES?", "PCS?", "PCE", "PCSETS?", "PCUN",
    "SETS?", "KGS?", "KGM", "MT", "M2?",
    "UNITS?", "UN", "BAGS?", "BOX(?:ES)?", "CARTONS?", "CTN",
    "ROLL", "PALLETS?", "LOT", "PACK", "PKG", "CBM",
    "DOZ", "NIU", "OTH", "L",
  ].join("|");
  return new RegExp(
    `^(?:\\d+\\s+)?(.{5,120}?)\\s+(\\d[\\d,.]*(?:\\.\\d+)?)\\s+(${UNIT_RE_STR})\\s+([\\d]+(?:[.,]\\s*\\d+)*)`,
    "i"
  );
}

function extractItems(
  text: string,
  tpl?: ParseTemplateConfig
): { items: ParsedPoItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const items: ParsedPoItem[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 3);

  const headerIdx = lines.findIndex(
    (l) => /description|deskripsi|item|barang/i.test(l) && /qty|quantity|jumlah/i.test(l)
  );
  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;
  const relevantLines = lines.slice(startIdx);
  const stopKeywords = /^(Total|Grand\s+Total|Subtotal|Terms|Notes?|Remarks?|Billing)/i;
  const euFormat = resolveEuFormat(text, tpl);

  let ITEM_RE = buildDefaultItemRe();
  if (tpl?.itemRowPattern) {
    try {
      ITEM_RE = new RegExp(tpl.itemRowPattern, "i");
    } catch {
      logger.warn("Invalid template item_row_pattern — using default");
    }
  }

  for (const rawLine of relevantLines) {
    if (stopKeywords.test(rawLine)) continue;
    const line = rawLine
      .replace(/\bT\.(\d{3,4})\b/g, "1.$1")
      .replace(/(\d[.,])\s+(\d)/g, "$1$2");
    const m = line.match(ITEM_RE);
    if (!m) continue;

    const desc = m[1].replace(/^\d+\s+/, "").replace(/\s*[-–—]+\s*$/, "").trim();
    const qty = parseQty(m[2], euFormat);
    const unitRaw = m[3].trim();
    const priceRaw = m[4].replace(/\s*\/\s*\w+$/, "").trim();
    const price = parsePrice(priceRaw);

    if (!desc || qty == null || qty <= 0 || price == null || price < 0) continue;
    if (desc.length < 4) continue;

    const { unit, mapped } = normalizeUnit(unitRaw);
    if (mapped) {
      warnings.push(`Unit "${unitRaw}" was not in the allowed list — mapped to "${unit}". Please verify.`);
    }
    items.push({ item_description: desc, qty, unit, unit_original: unitRaw, value: price });
  }

  if (items.length === 0) {
    const descMatch = text.match(/Item\s+Description\s*[:\s]+(.+?)(?:\n(?:Acct|Commodity|Need|Plant)|\n\n)/is);
    const qtyMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s+(PIECE|SET|KG|PCS|UNIT|BAG|ROLL|MT|CARTON|BOX)\b/i);
    const priceMatch = text.match(/Price\s*\(?\w{3}\)?\s*[:\s]*([\d,]+\.?\d{0,4})/i);
    if (descMatch?.[1] && qtyMatch && priceMatch) {
      const desc = descMatch[1].replace(/\s+/g, " ").trim();
      const qty = parseQty(qtyMatch[1], euFormat);
      const { unit, mapped } = normalizeUnit(qtyMatch[2]);
      const price = parsePrice(priceMatch[1]);
      if (desc && qty != null && qty > 0 && price != null && price >= 0) {
        if (mapped) warnings.push(`Unit "${qtyMatch[2]}" mapped to "${unit}". Please verify.`);
        items.push({ item_description: desc, qty, unit, unit_original: qtyMatch[2], value: price });
      }
    }
  }

  return { items, warnings };
}

export function parseFieldsFromOcrText(
  rawText: string,
  tpl?: ParseTemplateConfig
): Omit<ParsedPoResult, "confidence" | "raw_text_preview"> {
  const warnings: string[] = [];

  const poNumber = extractPoNumber(rawText, tpl);
  if (!poNumber) warnings.push("PO number could not be detected from the document.");

  const supplierName = extractSupplierName(rawText, tpl);
  if (!supplierName) warnings.push("Supplier name could not be detected. Please fill manually.");

  const currency = extractCurrency(rawText);
  if (!currency) warnings.push("Currency could not be detected. Defaulting to USD.");

  const incotermResult = extractIncoterm(rawText);
  const incotermLocation = incotermResult?.code ?? null;
  if (!incotermResult) warnings.push("Incoterm not detected. Please fill manually.");

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

  const { items, warnings: itemWarnings } = extractItems(rawText, tpl);
  warnings.push(...itemWarnings);
  if (items.length === 0) {
    warnings.push("No line items could be extracted. The table layout may be complex — please enter items manually.");
  }

  const completeness = analyzeItemCompleteness(rawText, items.length);
  const cw = completenessWarning(completeness, items.length);
  if (cw) warnings.push(cw);

  return {
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
    expected_item_count: completeness.expected_item_count,
    item_completeness: completeness.item_completeness,
    template_code: null,
    ai_assisted: false,
    ai_available: false,
  };
}

type ConfidenceInput = Omit<ParsedPoResult, "confidence" | "raw_text_preview">;

function scoreConfidence(result: ConfidenceInput): "high" | "medium" | "low" {
  if (result.item_completeness === "incomplete") return "low";

  let score = 0;
  if (result.po_number) score += 2;
  if (result.supplier_name) score += 2;
  if (result.currency) score += 1;
  if (result.incoterm_location) score += 1;
  if (result.items.length > 0) score += 2;
  if (result.delivery_location) score += 1;

  if (result.items.length === 0 && score >= 4) return "medium";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

/** Warnings that become stale after a successful AI item/header refresh. */
const STALE_ITEM_WARNING_RE =
  /line item|item list|missing line number|gaps in line number|No line items could be extracted|Detected \d+ line item|enter items manually|Please review the item list/i;

function isStaleWarningAfterAi(message: string): boolean {
  if (STALE_ITEM_WARNING_RE.test(message)) return true;
  if (/AI extraction|AI-assisted|AI returned|AI updated|AI did not/i.test(message)) return true;
  return false;
}

function rebuildWarningsAfterAi(
  ocrWarnings: string[],
  merged: ConfidenceInput,
  rawText: string,
  meta: {
    itemsBefore: number;
    itemsAfter: number;
    usedClaudeItems: boolean;
    aiFailed: boolean;
  }
): string[] {
  const kept = ocrWarnings.filter((w) => !isStaleWarningAfterAi(w));

  if (meta.aiFailed) {
    const warnings = [
      ...kept,
      "AI extraction failed — using OCR-only results. You may try again.",
    ];
    const completeness = analyzeItemCompleteness(rawText, merged.items.length);
    const cw = completenessWarning(completeness, merged.items.length);
    if (cw) warnings.push(cw);
    return warnings;
  }

  const warnings = [...kept];

  if (meta.usedClaudeItems && meta.itemsAfter > meta.itemsBefore) {
    warnings.push(
      `AI extraction complete: ${meta.itemsBefore} → ${meta.itemsAfter} line items. Please review before applying.`
    );
  } else if (meta.usedClaudeItems) {
    warnings.push(
      `AI extraction complete (${meta.itemsAfter} line items). Please review before applying.`
    );
  } else if (meta.itemsAfter < meta.itemsBefore) {
    warnings.push(
      `AI returned ${meta.itemsAfter} items (OCR had ${meta.itemsBefore}) — kept OCR item list. Header fields may still be updated.`
    );
  } else if (meta.itemsAfter === 0) {
    warnings.push(
      "AI did not return line items — kept OCR results. Please review and complete items manually."
    );
  } else {
    warnings.push(
      "AI updated header fields; line items unchanged from OCR. Please review before applying."
    );
  }

  const completeness = resolveCompletenessAfterAi(
    analyzeItemCompleteness(rawText, merged.items.length),
    merged.items.length,
    true
  );
  const cw = completenessWarning(completeness, merged.items.length);
  if (cw) warnings.push(cw);

  return warnings;
}

function applyCompletenessAfterAi(
  rawText: string,
  merged: ConfidenceInput,
  aiAssisted: boolean
): ConfidenceInput {
  if (!aiAssisted) return merged;
  const base = analyzeItemCompleteness(rawText, merged.items.length);
  const resolved = resolveCompletenessAfterAi(base, merged.items.length, true);
  return {
    ...merged,
    expected_item_count: resolved.expected_item_count,
    item_completeness: resolved.item_completeness,
  };
}

/** AI merge: prefer Claude value when present. */
export function pickHeaderFieldForAi(base: string | null, patch?: string | null): string | null {
  if (patch != null && patch.trim() !== "") return patch.trim();
  return base;
}

function pickKawasanBerikatForAi(
  base: "Yes" | "No" | null,
  patch?: "Yes" | "No" | null
): "Yes" | "No" | null {
  if (patch != null) return patch;
  return base;
}

/** AI merge: prefer Claude items when they improve on incomplete OCR. */
export function pickItemsForAi(
  base: ParsedPoItem[],
  claude: ParsedPoItem[] | undefined,
  itemCompleteness: ItemCompleteness
): ParsedPoItem[] {
  if (!claude || claude.length === 0) return base;
  if (base.length === 0) return claude;
  if (claude.length >= base.length) return claude;
  if (itemCompleteness === "incomplete") return claude;
  return base;
}

function mergeClaudeData(
  rawText: string,
  base: ConfidenceInput,
  data: {
    po_number?: string | null;
    supplier_name?: string | null;
    currency?: string | null;
    incoterm_location?: string | null;
    delivery_location?: string | null;
    kawasan_berikat?: "Yes" | "No" | null;
    items?: ParsedPoItem[];
  }
): ConfidenceInput {
  const items = pickItemsForAi(base.items, data.items, base.item_completeness);
  const merged: ConfidenceInput = {
    ...base,
    po_number: pickHeaderFieldForAi(base.po_number, data.po_number),
    supplier_name: pickHeaderFieldForAi(base.supplier_name, data.supplier_name),
    currency: pickHeaderFieldForAi(base.currency, data.currency),
    incoterm_location: pickHeaderFieldForAi(base.incoterm_location, data.incoterm_location),
    delivery_location: pickHeaderFieldForAi(base.delivery_location, data.delivery_location),
    kawasan_berikat: pickKawasanBerikatForAi(base.kawasan_berikat, data.kawasan_berikat),
    items,
    ai_assisted: true,
  };
  return applyCompletenessAfterAi(rawText, merged, true);
}

/** Atomically reserve one AI call per user per file — must run before Claude API. */
async function reserveAiUsage(contentHash: string, userId: string): Promise<boolean> {
  const usageRepo = new PoPdfAiUsageRepository();
  return usageRepo.tryRecordUsage(contentHash, userId, "extract");
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function resolveAiAvailability(
  contentHash: string | undefined,
  userId: string | undefined
): Promise<{ ai_available: boolean; ai_unavailable_reason: PoPdfAiUnavailableReason | null }> {
  if (!config.poPdfClaude.enabled) {
    return { ai_available: false, ai_unavailable_reason: "claude_disabled" };
  }
  if (!config.poPdfClaude.apiKey) {
    return { ai_available: false, ai_unavailable_reason: "missing_api_key" };
  }
  if (!contentHash || !userId) {
    return { ai_available: false, ai_unavailable_reason: "missing_session" };
  }
  const usageRepo = new PoPdfAiUsageRepository();
  if (await usageRepo.hasUsedAi(contentHash, userId)) {
    return { ai_available: false, ai_unavailable_reason: "quota_used" };
  }
  return { ai_available: true, ai_unavailable_reason: null };
}

export async function parsePoPdf(
  pdfPath: string,
  options: ParsePoPdfOptions = {}
): Promise<ParsedPoResult> {
  const { contentHash, userId, originalFilename, requestAi = false } = options;

  logger.info("PO PDF parse started", { pdf: pdfPath, request_ai: requestAi });

  const ocrResult = await extractOcrTextFromPdf(pdfPath);
  const rawText = ocrResult.text;
  logger.debug("OCR complete", { chars: rawText.length, pages: ocrResult.pageCount });

  const templateRepo = new PoDocumentTemplateRepository();
  const templates = await templateRepo.listActive();
  const match = matchTemplate(rawText, templates);
  const tplConfig = templateToConfig(match?.template ?? null);

  let partial = parseFieldsFromOcrText(rawText, tplConfig);
  partial.template_code = match?.template.code ?? null;

  if (ocrResult.truncated) {
    partial.warnings.push(
      `Document has ${ocrResult.pageCount} pages; only the first ${MAX_OCR_PAGES} were scanned. Review line items carefully.`
    );
  }

  let aiAssisted = false;

  const aiRequestReady =
    requestAi &&
    Boolean(contentHash && userId) &&
    config.poPdfClaude.enabled &&
    Boolean(config.poPdfClaude.apiKey);

  if (requestAi && !config.poPdfClaude.enabled) {
    partial.warnings.push("AI extraction is not enabled on the server. Contact your administrator.");
  }

  const confidenceBeforeAi = scoreConfidence(partial);
  const itemsBeforeAi = partial.items.length;
  const ocrWarnings = [...partial.warnings];

  if (aiRequestReady && contentHash && userId) {
    const auditRepo = new PoPdfAiRequestRepository();

    const reserved = await reserveAiUsage(contentHash, userId);
    if (!reserved) {
      partial.warnings.push(
        "AI already used for this file (limit: 1 per document). Review results or upload a different scan."
      );
    } else {
      let extractError: string | null = null;
      let extractModel: string | null = null;
      let inputTokens: number | null = null;
      let outputTokens: number | null = null;

      try {
        const extracted = await claudeExtractFromPdf(pdfPath, {
          ocrItemCount: partial.items.length,
          expectedItemCount: partial.expected_item_count,
          po_number: partial.po_number,
          supplier_name: partial.supplier_name,
          currency: partial.currency,
        });

        if (extracted) {
          extractModel = extracted.model;
          inputTokens = extracted.inputTokens;
          outputTokens = extracted.outputTokens;

          const claudeItems = extracted.data.items ?? [];
          const usedClaudeItems =
            claudeItems.length > 0 && claudeItems.length >= itemsBeforeAi;

          partial = mergeClaudeData(rawText, partial, extracted.data);
          aiAssisted = true;

          partial.warnings = rebuildWarningsAfterAi(ocrWarnings, partial, rawText, {
            itemsBefore: itemsBeforeAi,
            itemsAfter: partial.items.length,
            usedClaudeItems,
            aiFailed: false,
          });

          const confidenceAfter = scoreConfidence(partial);
          await auditRepo.insert({
            contentHash,
            userId,
            originalFilename,
            poNumber: partial.po_number,
            templateCode: partial.template_code,
            status: "success",
            confidenceBefore: confidenceBeforeAi,
            confidenceAfter,
            itemsBefore: itemsBeforeAi,
            itemsAfter: partial.items.length,
            itemCompleteness: partial.item_completeness,
            model: extractModel,
            inputTokens,
            outputTokens,
          });
        } else {
          extractError = "AI returned no usable data";
          partial.warnings = rebuildWarningsAfterAi(ocrWarnings, partial, rawText, {
            itemsBefore: itemsBeforeAi,
            itemsAfter: itemsBeforeAi,
            usedClaudeItems: false,
            aiFailed: true,
          });
          await auditRepo.insert({
            contentHash,
            userId,
            originalFilename,
            poNumber: partial.po_number,
            templateCode: partial.template_code,
            status: "failed",
            confidenceBefore: confidenceBeforeAi,
            confidenceAfter: confidenceBeforeAi,
            itemsBefore: itemsBeforeAi,
            itemsAfter: itemsBeforeAi,
            itemCompleteness: partial.item_completeness,
            model: config.poPdfClaude.model,
            errorMessage: extractError,
          });
        }
      } catch (err) {
        extractError = String(err).slice(0, 500);
        partial.warnings = rebuildWarningsAfterAi(ocrWarnings, partial, rawText, {
          itemsBefore: itemsBeforeAi,
          itemsAfter: itemsBeforeAi,
          usedClaudeItems: false,
          aiFailed: true,
        });
        await auditRepo.insert({
          contentHash,
          userId,
          originalFilename,
          poNumber: partial.po_number,
          templateCode: partial.template_code,
          status: "failed",
          confidenceBefore: confidenceBeforeAi,
          confidenceAfter: confidenceBeforeAi,
          itemsBefore: itemsBeforeAi,
          itemsAfter: itemsBeforeAi,
          itemCompleteness: partial.item_completeness,
          model: config.poPdfClaude.model,
          errorMessage: extractError,
        }).catch((logErr) => {
          logger.error("Failed to write PO PDF AI audit log", { error: String(logErr) });
        });
      }
    }
  }

  partial.ai_assisted = aiAssisted;
  const aiGate = await resolveAiAvailability(contentHash, userId);

  const confidence = scoreConfidence(partial);

  let ai_available = aiGate.ai_available;
  let ai_unavailable_reason = aiGate.ai_unavailable_reason;
  if (!aiAssisted && confidence === "high") {
    ai_available = false;
    ai_unavailable_reason = "high_confidence";
  }
  partial.ai_available = ai_available;
  partial.ai_unavailable_reason = ai_unavailable_reason;

  const result: ParsedPoResult = {
    ...partial,
    confidence,
    confidence_before: aiAssisted ? confidenceBeforeAi : undefined,
    raw_text_preview: "",
  };

  logger.info("PO PDF parse complete", {
    po_number: result.po_number,
    items: result.items.length,
    confidence,
    template: result.template_code,
    request_ai: requestAi,
    ai_assisted: result.ai_assisted,
    ai_available: result.ai_available,
    ai_unavailable_reason: result.ai_unavailable_reason,
    item_completeness: result.item_completeness,
  });

  return result;
}
