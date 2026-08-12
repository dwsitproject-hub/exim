import { formatNumberDisplay } from "@/lib/format-numbers";
import { findCommodityMatch, type Commodity } from "@/services/commodity-service";
import type { CargoLine } from "@/types/export-bulking";

export type BlSplitMode = "Max" | "Min" | "Exact" | "Balance";

export const BL_SPLIT_MODES_LIQUID: BlSplitMode[] = ["Max", "Min", "Balance"];
export const BL_SPLIT_MODES_SOLID: BlSplitMode[] = ["Max", "Min", "Exact", "Balance"];

export type BlSplitEntry = { count: number; quantity: number; mode?: BlSplitMode };

export type BlSplitDraft = {
  rowKey: string;
  count: string;
  quantity: string;
  mode: string;
};

export const BL_SPLIT_COUNT_OPTIONS = Array.from({ length: 20 }, (_, i) => String(i + 1));

const QTY_EPSILON = 1e-6;

export function blSplitModesForCargo(
  cargo: CargoLine | undefined,
  commodities: Commodity[],
): BlSplitMode[] {
  if (!cargo) return BL_SPLIT_MODES_LIQUID;
  const match = findCommodityMatch(cargo.cargo_name, commodities);
  return match?.commodity_type === "Solid" ? BL_SPLIT_MODES_SOLID : BL_SPLIT_MODES_LIQUID;
}

export function normalizeBlSplitMode(raw: string | undefined | null): BlSplitMode | null {
  const t = raw?.trim();
  if (!t) return null;
  if (t === "Max" || t === "Min" || t === "Exact" || t === "Balance") return t;
  return null;
}

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
  const mode = normalizeBlSplitMode(d.mode) ?? "Balance";
  if (count == null || quantity == null || quantity <= 0) return null;
  return { count, quantity, mode };
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

/** B/L split total must not exceed the SI line quantity field. */
export function blSplitsExceedTarget(
  entries: BlSplitEntry[],
  target: number | null | undefined,
): boolean {
  if (entries.length === 0) return false;
  if (target == null || Number.isNaN(Number(target))) return false;
  return sumBlSplitQuantities(entries) - Number(target) > QTY_EPSILON;
}

/** Persisted SI line qty follows B/L splits when present, else the quantity field. */
export function effectiveSiLineQuantityFromBlSplits(
  lineQty: number | null | undefined,
  entries: BlSplitEntry[],
): number | null {
  const splitTotal = entries.length > 0 ? sumBlSplitQuantities(entries) : null;
  if (splitTotal != null && splitTotal > 0) return splitTotal;
  if (lineQty == null || Number.isNaN(Number(lineQty))) return null;
  return Number(lineQty) > 0 ? Number(lineQty) : null;
}

/** Document line: `1 X 4,994.731 MTS MAX` */
export function formatBlSplitDocumentLine(entry: BlSplitEntry): string {
  const base = `${entry.count} X ${formatNumberDisplay(entry.quantity)} MTS`;
  const mode = entry.mode ?? "Balance";
  return `${base} ${mode.toUpperCase()}`;
}

export function formatBlSplitDocumentText(entries: BlSplitEntry[]): string {
  return entries.map(formatBlSplitDocumentLine).join("\n");
}

export function newBlSplitDraft(
  quantity?: number | null,
  mode: BlSplitMode = "Balance",
): BlSplitDraft {
  return {
    rowKey: `bl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    count: "1",
    mode,
    quantity:
      quantity != null && !Number.isNaN(Number(quantity))
        ? formatNumberDisplay(Number(quantity))
        : "",
  };
}

export function blSplitDraftsFromEntries(entries: BlSplitEntry[]): BlSplitDraft[] {
  return entries.map((e, i) => ({
    rowKey: `bl-saved-${i}-${e.count}`,
    count: String(e.count),
    quantity: formatNumberDisplay(e.quantity),
    mode: e.mode ?? "Balance",
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
  return [newBlSplitDraft(q, "Balance")];
}

export function blSplitDraftsEqual(a: BlSplitDraft[], b: BlSplitDraft[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const o = b[i];
    if (!o) return false;
    return row.count === o.count && row.quantity === o.quantity && row.mode === o.mode;
  });
}
