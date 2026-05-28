/**
 * Builds field-level diff for PATCH /po/:id activity log (before vs after DB state).
 */

import type { PoIntakeItemRow, PoIntakeRow } from "../dto/index.js";
import type { PoIntakeUpdateFieldChange } from "../repositories/po-intake-update-log.repository.js";

const HEADER_KEYS = [
  "po_number",
  "plant",
  "pt",
  "supplier_name",
  "delivery_location",
  "incoterm_location",
  "kawasan_berikat",
  "currency",
] as const;

const HEADER_LABELS: Record<(typeof HEADER_KEYS)[number], string> = {
  po_number: "PO number",
  plant: "Plant",
  pt: "PT",
  supplier_name: "Supplier",
  delivery_location: "Delivery location",
  incoterm_location: "Incoterms",
  kawasan_berikat: "Kawasan berikat",
  currency: "Currency",
};

function normStr(v: string | null | undefined): string {
  if (v == null) return "";
  return String(v).trim();
}

function fmtScalar(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "—") : String(v).trim();
  return s === "" ? "—" : s;
}

function summarizeLine(it: PoIntakeItemRow): string {
  const d = fmtScalar(it.item_description);
  const q = fmtScalar(it.qty as number | null);
  const u = fmtScalar(it.unit);
  const p = fmtScalar(it.value as number | null);
  return `${d} · Qty ${q} ${u} @ ${p}`;
}

function numEq(a: number | null | undefined, b: number | null | undefined): boolean {
  const x = a == null || !Number.isFinite(Number(a)) ? null : Number(a);
  const y = b == null || !Number.isFinite(Number(b)) ? null : Number(b);
  if (x === null && y === null) return true;
  if (x === null || y === null) return false;
  return Math.abs(x - y) < 1e-9;
}

export function buildPoIntakeUpdateDiff(
  beforeRow: PoIntakeRow,
  beforeItems: PoIntakeItemRow[],
  afterRow: PoIntakeRow,
  afterItems: PoIntakeItemRow[]
): { fieldsChanged: string[]; fieldChanges: PoIntakeUpdateFieldChange[] } {
  const fieldChanges: PoIntakeUpdateFieldChange[] = [];

  for (const key of HEADER_KEYS) {
    const b = beforeRow[key];
    const a = afterRow[key];
    const bs = fmtScalar(b as string | null);
    const as = fmtScalar(a as string | null);
    if (bs !== as) {
      fieldChanges.push({
        field: key,
        label: HEADER_LABELS[key],
        before: b == null ? null : String(b),
        after: a == null ? null : String(a),
      });
    }
  }

  const beforeById = new Map(beforeItems.map((i) => [i.id, i]));
  const afterById = new Map(afterItems.map((i) => [i.id, i]));
  const beforeIds = new Set(beforeById.keys());
  const afterIds = new Set(afterById.keys());

  for (const id of beforeIds) {
    if (!afterIds.has(id)) {
      const bi = beforeById.get(id)!;
      fieldChanges.push({
        field: `line_${id}_removed`,
        label: `Line ${bi.line_number} removed`,
        before: summarizeLine(bi),
        after: null,
      });
    }
  }

  for (const id of afterIds) {
    if (!beforeIds.has(id)) {
      const ai = afterById.get(id)!;
      fieldChanges.push({
        field: `line_${id}_added`,
        label: `Line ${ai.line_number} added`,
        before: null,
        after: summarizeLine(ai),
      });
    }
  }

  for (const id of afterIds) {
    if (!beforeIds.has(id)) continue;
    const bi = beforeById.get(id)!;
    const ai = afterById.get(id)!;
    const n = ai.line_number;
    if (normStr(bi.item_description) !== normStr(ai.item_description)) {
      fieldChanges.push({
        field: `line_${id}_description`,
        label: `Line ${n} — description`,
        before: bi.item_description == null ? null : String(bi.item_description),
        after: ai.item_description == null ? null : String(ai.item_description),
      });
    }
    if (!numEq(bi.qty, ai.qty)) {
      fieldChanges.push({
        field: `line_${id}_qty`,
        label: `Line ${n} — qty`,
        before: bi.qty == null ? null : String(bi.qty),
        after: ai.qty == null ? null : String(ai.qty),
      });
    }
    if (normStr(bi.unit) !== normStr(ai.unit)) {
      fieldChanges.push({
        field: `line_${id}_unit`,
        label: `Line ${n} — unit`,
        before: bi.unit == null ? null : String(bi.unit),
        after: ai.unit == null ? null : String(ai.unit),
      });
    }
    if (!numEq(bi.value, ai.value)) {
      fieldChanges.push({
        field: `line_${id}_unit_price`,
        label: `Line ${n} — price per unit`,
        before: bi.value == null ? null : String(bi.value),
        after: ai.value == null ? null : String(ai.value),
      });
    }
  }

  const fieldsChanged = fieldChanges.map((c) => c.field);
  return { fieldsChanged, fieldChanges };
}
