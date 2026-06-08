/**
 * Item completeness heuristics for PO PDF OCR output.
 * Detects when parsed item count is likely lower than the document's line numbers.
 */

export type ItemCompleteness = "complete" | "incomplete" | "unknown";

export interface ItemCompletenessResult {
  expected_item_count: number | null;
  item_completeness: ItemCompleteness;
  line_numbers_found: number[];
  missing_line_numbers: number[];
}

const LINE_NUMBER_RE = /\b(\d{3})\s+(?=[A-Z])/g;

/**
 * Scans OCR text for 3-digit line prefixes (e.g. "002 VALVE", "025 FILTER").
 * Returns max line number as expected count and any gaps in the sequence.
 */
export function analyzeItemCompleteness(
  ocrText: string,
  parsedItemCount: number
): ItemCompletenessResult {
  const lineNumbers = new Set<number>();

  for (const line of ocrText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length < 6) continue;
    LINE_NUMBER_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINE_NUMBER_RE.exec(trimmed)) !== null) {
      const n = parseInt(m[1]!, 10);
      if (n >= 1 && n <= 999) lineNumbers.add(n);
    }
  }

  const sorted = Array.from(lineNumbers).sort((a, b) => a - b);

  if (sorted.length === 0) {
    return {
      expected_item_count: null,
      item_completeness: "unknown",
      line_numbers_found: [],
      missing_line_numbers: [],
    };
  }

  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const missing: number[] = [];
  for (let i = min; i <= max; i++) {
    if (!lineNumbers.has(i)) missing.push(i);
  }

  const expected = max;
  let item_completeness: ItemCompleteness = "complete";

  if (parsedItemCount < expected || missing.length > 0) {
    item_completeness = "incomplete";
  }

  return {
    expected_item_count: expected,
    item_completeness,
    line_numbers_found: sorted,
    missing_line_numbers: missing,
  };
}

/**
 * After AI extraction, treat item list as complete when parsed count meets OCR line-number expectation.
 */
export function resolveCompletenessAfterAi(
  result: ItemCompletenessResult,
  parsedItemCount: number,
  aiAssisted: boolean
): ItemCompletenessResult {
  if (!aiAssisted) return result;

  if (
    result.expected_item_count != null &&
    parsedItemCount >= result.expected_item_count
  ) {
    return {
      ...result,
      item_completeness: "complete",
      missing_line_numbers: [],
    };
  }

  if (result.expected_item_count == null && parsedItemCount > 0) {
    return { ...result, item_completeness: "complete" };
  }

  return result;
}

export function completenessWarning(result: ItemCompletenessResult, parsedCount: number): string | null {
  if (result.item_completeness !== "incomplete") return null;
  const parts: string[] = [];
  if (result.expected_item_count != null && parsedCount < result.expected_item_count) {
    parts.push(
      `Detected ${parsedCount} line item(s) but document line numbers suggest ~${result.expected_item_count}. Please review the item list.`
    );
  }
  if (result.missing_line_numbers.length > 0 && result.missing_line_numbers.length <= 5) {
    parts.push(`Possible missing line numbers: ${result.missing_line_numbers.join(", ")}.`);
  } else if (result.missing_line_numbers.length > 5) {
    parts.push(`${result.missing_line_numbers.length} gaps in line number sequence detected.`);
  }
  return parts.join(" ") || null;
}
