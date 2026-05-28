import type { PoCsvImportErrorRow } from "../modules/po-intake/dto/index.js";
import type { ShipmentCsvImportErrorRow } from "../modules/shipments/dto/index.js";

function countBy<T extends string>(items: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const x of items) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

type PoErrCat = "duplicate_po" | "group_inconsistent" | "validation" | "other";

function categorizePoImportError(e: PoCsvImportErrorRow): PoErrCat {
  if (e.field === "po_number" && /already exists/i.test(e.message)) return "duplicate_po";
  if (e.field === "po_group") return "group_inconsistent";
  if (e.field === "line_number" && /duplicate/i.test(e.message)) return "group_inconsistent";
  if (
    e.field === "po_number" ||
    e.field === "supplier_name" ||
    e.field === "line_number" ||
    e.field === "qty" ||
    e.field === "unit_price" ||
    e.field === "kawasan_berikat"
  )
    return "validation";
  return "other";
}

/** Human-readable import outcome for PO CSV. */
export function buildPoCsvImportSummary(result: {
  imported_pos: number;
  imported_rows: number;
  failed_rows: number;
  errors: PoCsvImportErrorRow[];
}): string {
  const parts: string[] = [
    `${result.imported_pos} PO(s) imported (${result.imported_rows} line row(s) written).`,
  ];
  if (result.failed_rows <= 0) return parts.join(" ");

  const cats = result.errors.map(categorizePoImportError);
  const tally = countBy(cats);
  parts.push(`${result.failed_rows} row(s) failed.`);

  const hints: string[] = [];
  const dup = tally.get("duplicate_po") ?? 0;
  if (dup) hints.push(`${dup} duplicate or existing PO number`);
  const grp = tally.get("group_inconsistent") ?? 0;
  if (grp) hints.push(`${grp} inconsistent values within the same PO group`);
  const val = tally.get("validation") ?? 0;
  if (val) hints.push(`${val} validation issue(s)`);
  const oth = tally.get("other") ?? 0;
  if (oth) hints.push(`${oth} other error(s)`);

  if (hints.length) parts.push(hints.join("; ") + ".");
  return parts.join(" ");
}

type ShipErrCat = "missing_po_ref" | "po_line" | "group_shipment" | "validation" | "other";

function categorizeShipmentImportError(e: ShipmentCsvImportErrorRow): ShipErrCat {
  if (
    (e.field === "po_number" || e.field === "intake_id") &&
    (/not found/i.test(e.message) || /PO not found/i.test(e.message) || /PO intake not found/i.test(e.message))
  ) {
    return "missing_po_ref";
  }
  if (e.field === "line_number" && /not found/i.test(e.message)) return "po_line";
  if (e.field === "shipment") return "group_shipment";
  if (
    e.field === "shipment_no" ||
    e.field === "delivered_qty" ||
    e.field === "received_qty" ||
    e.field === "currency_rate" ||
    e.field === "etd" ||
    e.field === "eta" ||
    e.field === "bm_percentage" ||
    e.field === "ppn_percentage" ||
    e.field === "pph_percentage" ||
    e.field === "bm" ||
    e.field === "ppn_amount" ||
    e.field === "pph_amount" ||
    e.field === "pdri" ||
    e.field === "currency" ||
    e.field === "pt" ||
    e.field === "plant"
  )
    return "validation";
  return "other";
}

/** Human-readable import outcome for shipment CSV (linked to existing PO intake). */
export function buildShipmentCsvImportSummary(result: {
  imported_shipments: number;
  imported_rows: number;
  failed_rows: number;
  errors: ShipmentCsvImportErrorRow[];
}): string {
  const parts: string[] = [
    `${result.imported_shipments} shipment group(s) updated (${result.imported_rows} data row(s) applied).`,
  ];
  if (result.failed_rows <= 0) return parts.join(" ");

  const cats = result.errors.map(categorizeShipmentImportError);
  const tally = countBy(cats);
  parts.push(`${result.failed_rows} row(s) not applied.`);

  const hints: string[] = [];
  const miss = tally.get("missing_po_ref") ?? 0;
  if (miss) hints.push(`${miss} missing or unknown PO reference`);
  const line = tally.get("po_line") ?? 0;
  if (line) hints.push(`${line} invalid or missing PO line`);
  const grp = tally.get("group_shipment") ?? 0;
  if (grp) hints.push(`${grp} shipment grouping issue(s)`);
  const val = tally.get("validation") ?? 0;
  if (val) hints.push(`${val} validation issue(s)`);
  const oth = tally.get("other") ?? 0;
  if (oth) hints.push(`${oth} other error(s)`);

  if (hints.length) parts.push(hints.join("; ") + ".");
  return parts.join(" ");
}
