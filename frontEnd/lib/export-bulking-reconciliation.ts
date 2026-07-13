import type { CargoLine } from "@/types/export-bulking";

export type ReconciliationBlSource = "shore" | "ship";

export type ReconciliationLineDraft = {
  id: string;
  cargo_name: string;
  item_description: string;
  shore_figure: string;
  ship_figure: string;
  remarks: string;
};

export function parseQuantityInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

export function resolveInheritedBlFigure(
  row: Pick<ReconciliationLineDraft, "shore_figure" | "ship_figure">,
  source: ReconciliationBlSource,
): string {
  return source === "shore" ? row.shore_figure : row.ship_figure;
}

/** Diff (MT) = Ship Figure − B/L Figure (inherited). */
export function calcReconciliationDiff(
  blFigure: string,
  shipFigure: string,
): number | null {
  const bl = parseQuantityInput(blFigure);
  const ship = parseQuantityInput(shipFigure);
  if (bl == null || ship == null) return null;
  return ship - bl;
}

export function calcReconciliationDiffPct(diff: number | null, blFigure: string): number | null {
  const bl = parseQuantityInput(blFigure);
  if (diff == null || bl == null || bl === 0) return null;
  return (diff / bl) * 100;
}

/** Infer header toggle from saved B/L vs shore/ship figures. */
export function inferReconciliationBlSource(lines: CargoLine[]): ReconciliationBlSource {
  for (const line of lines) {
    const bl = line.bl_figure;
    const ship = line.ship_figure;
    const shore = line.quantity_delivered;
    if (bl == null) continue;
    if (ship != null && Math.abs(bl - ship) < 1e-6) return "ship";
    if (shore != null && Math.abs(bl - shore) < 1e-6) return "shore";
  }
  return "shore";
}
