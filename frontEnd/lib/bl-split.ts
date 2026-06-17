import { formatNumberDisplay } from "@/lib/format-numbers";

export type BlSplitEntry = { count: number; quantity: number };

export type BlSplitDraft = {
  rowKey: string;
  count: string;
  quantity: string;
};

export const BL_SPLIT_COUNT_OPTIONS = Array.from({ length: 20 }, (_, i) => String(i + 1));

const QTY_EPSILON = 1e-6;

export function parseBlSplitCount(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isNaN(n) || n < 1 ? null : n;
}

export function parseBlSplitQuantity(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

export function blSplitDraftToEntry(d: BlSplitDraft): BlSplitEntry | null {
  const count = parseBlSplitCount(d.count);
  const quantity = parseBlSplitQuantity(d.quantity);
  if (count == null || quantity == null || quantity <= 0) return null;
  return { count, quantity };
}

export function blSplitEntriesFromDrafts(drafts: BlSplitDraft[]): BlSplitEntry[] {
  return drafts.map(blSplitDraftToEntry).filter((e): e is BlSplitEntry => e != null);
}

export function sumBlSplitQuantities(entries: BlSplitEntry[]): number {
  return entries.reduce((sum, e) => sum + e.quantity, 0);
}

export function blSplitsCloseToTarget(
  entries: BlSplitEntry[],
  target: number | null | undefined,
): boolean {
  if (target == null || Number.isNaN(Number(target))) return entries.length === 0;
  return Math.abs(sumBlSplitQuantities(entries) - Number(target)) < QTY_EPSILON;
}

/** Document line: `1 X 4,994.731 MTS` */
export function formatBlSplitDocumentLine(count: number, quantity: number): string {
  return `${count} X ${formatNumberDisplay(quantity)} MTS`;
}

export function formatBlSplitDocumentText(entries: BlSplitEntry[]): string {
  return entries.map((e) => formatBlSplitDocumentLine(e.count, e.quantity)).join("\n");
}

export function newBlSplitDraft(quantity?: number | null): BlSplitDraft {
  return {
    rowKey: `bl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    count: "1",
    quantity: quantity != null && !Number.isNaN(Number(quantity))
      ? formatNumberDisplay(Number(quantity))
      : "",
  };
}

export function blSplitDraftsFromEntries(entries: BlSplitEntry[]): BlSplitDraft[] {
  return entries.map((e, i) => ({
    rowKey: `bl-saved-${i}-${e.count}`,
    count: String(e.count),
    quantity: formatNumberDisplay(e.quantity),
  }));
}

/** Legacy single numeric bl_split_qty → one split row. */
export function blSplitDraftsFromLegacy(
  blSplitQty: number | null | undefined,
  lineQty: number | null | undefined,
): BlSplitDraft[] {
  const q =
    blSplitQty != null && !Number.isNaN(Number(blSplitQty))
      ? Number(blSplitQty)
      : lineQty != null && !Number.isNaN(Number(lineQty))
        ? Number(lineQty)
        : null;
  if (q == null || q <= 0) return [newBlSplitDraft()];
  return [newBlSplitDraft(q)];
}

export function blSplitDraftsEqual(a: BlSplitDraft[], b: BlSplitDraft[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const o = b[i];
    if (!o) return false;
    return row.count === o.count && row.quantity === o.quantity;
  });
}
