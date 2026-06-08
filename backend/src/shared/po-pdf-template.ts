/**
 * PO document template matching — scores fingerprint phrases against OCR header text.
 */

import type { PoDocumentTemplateRow } from "../modules/po-intake/repositories/po-document-template.repository.js";

const MATCH_WINDOW_CHARS = 2500;
const MIN_MATCH_SCORE = 2;

export interface TemplateMatchResult {
  template: PoDocumentTemplateRow;
  score: number;
}

/**
 * Returns the best-matching active template, or null if no template scores above threshold.
 */
export function matchTemplate(
  ocrText: string,
  templates: PoDocumentTemplateRow[]
): TemplateMatchResult | null {
  const window = ocrText.slice(0, MATCH_WINDOW_CHARS).toLowerCase();
  let best: TemplateMatchResult | null = null;

  for (const template of templates) {
    let score = 0;
    for (const phrase of template.fingerprint_phrases) {
      if (phrase && window.includes(phrase.toLowerCase())) score++;
    }
    if (score >= MIN_MATCH_SCORE && (!best || score > best.score)) {
      best = { template, score };
    }
  }

  return best;
}

/** Build a stable auto-template code from fingerprint phrases. */
export function buildAutoTemplateCode(phrases: string[]): string {
  const slug = phrases
    .slice(0, 2)
    .map((p) => p.replace(/[^a-z0-9]+/gi, "_").toLowerCase().slice(0, 20))
    .filter(Boolean)
    .join("_");
  return `auto_${slug || "unknown"}`.slice(0, 80);
}
