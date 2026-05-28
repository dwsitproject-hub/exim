/**
 * Shared CSV parsing and flexible header → canonical field mapping for bulk imports.
 */

export function stripBom(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

export function splitCsvTextToNonEmptyLines(csvText: string): string[] {
  return csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Like `splitCsvTextToNonEmptyLines`, but drops lines that start with `#` after trim
 * (except the first line, which is always treated as the header row).
 * Lets templates ship with dropdown / hint rows users can delete before upload.
 */
export function splitCsvTextToDataLines(csvText: string): string[] {
  const lines = splitCsvTextToNonEmptyLines(csvText);
  if (lines.length === 0) return [];
  const [header, ...rest] = lines;
  const body = rest.filter((l) => !l.startsWith("#"));
  return [header, ...body];
}

export function parseCsvLine(line: string, delimiter: "," | ";"): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && c === delimiter) {
      result.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

/** Prefer semicolon when Excel (EU/ID locale) exports CSV; otherwise comma. */
export function detectCsvDelimiter(headerLine: string): "," | ";" {
  const commaCols = parseCsvLine(stripBom(headerLine), ",").length;
  const semiCols = parseCsvLine(stripBom(headerLine), ";").length;
  if (semiCols > commaCols) return ";";
  return ",";
}

/** Normalize header labels for synonym matching. */
export function normalizeCsvHeaderLabel(raw: string): string {
  return stripBom(raw)
    .trim()
    .toLowerCase()
    .replace(/[#.]/g, "")
    .replace(/\s+/g, " ")
    .replace(/_/g, " ");
}

/** canonicalField → acceptable header labels (normalized on compare). */
export type CsvColumnAliases = Readonly<Record<string, readonly string[]>>;

function headerMatchesSynonym(normalizedHeader: string, synonym: string): boolean {
  const ns = normalizeCsvHeaderLabel(synonym);
  if (normalizedHeader === ns) return true;
  if (normalizedHeader.replace(/\s/g, "") === ns.replace(/\s/g, "")) return true;
  return false;
}

/**
 * Map CSV header cells to column indices for canonical field names.
 * First matching column wins. Optional fields may be absent (no index).
 */
export function resolveCsvColumnIndices(
  headerCells: string[],
  canonicalFields: readonly string[],
  aliases: CsvColumnAliases
): { indices: Record<string, number>; ambiguous: string[] } {
  const normalizedHeaders = headerCells.map((h) => normalizeCsvHeaderLabel(h));
  const indices: Record<string, number> = {};
  const ambiguous: string[] = [];

  for (const field of canonicalFields) {
    const synonyms = aliases[field] ?? [field];
    for (let col = 0; col < normalizedHeaders.length; col++) {
      const nh = normalizedHeaders[col]!;
      if (synonyms.some((syn) => headerMatchesSynonym(nh, syn))) {
        if (indices[field] !== undefined) {
          ambiguous.push(field);
          break;
        }
        indices[field] = col;
        break;
      }
    }
  }

  return { indices, ambiguous };
}

export function csvCell(cells: string[], colIndex: number | undefined): string {
  if (colIndex == null || colIndex < 0) return "";
  return cells[colIndex] ?? "";
}

/** Parses numbers from Excel/locale exports: thousands separators, EU-style decimals. */
export function isUuidString(s: string): boolean {
  const t = s.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t);
}

export function parseInternationalNumber(text: string): number | undefined {
  let t = text.trim();
  if (!t) return undefined;
  if (/e/i.test(t)) {
    t = t.replace(/,/g, ".");
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  if (lastComma > lastDot) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else {
    const dotParts = t.split(".");
    if (dotParts.length > 2) t = t.replace(/\./g, "");
    else t = t.replace(/,/g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
