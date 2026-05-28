/**
 * Update received qty and optional net/gross weight (MT) per PO line for a linked PO.
 */

import type { Request } from "express";
import type { ErrorField } from "../../../shared/response.js";

export interface UpdatePoLineItemDto {
  item_id: string;
  received_qty: number;
  bm_percentage?: number | null;
  ppn_percentage?: number | null;
  pph_percentage?: number | null;
}

export interface UpdatePoLinesDto {
  lines: UpdatePoLineItemDto[];
}

export function validateUpdatePoLinesBody(
  req: Request
): { ok: true; data: UpdatePoLinesDto } | { ok: false; errors: ErrorField[] } {
  const body = req.body as Record<string, unknown>;
  const errors: ErrorField[] = [];
  const raw = body?.lines;
  if (!Array.isArray(raw)) {
    errors.push({ field: "lines", message: "lines must be an array" });
    return { ok: false, errors };
  }

  const lines: UpdatePoLineItemDto[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i] && typeof raw[i] === "object" ? (raw[i] as Record<string, unknown>) : {};
    const item_id = typeof item.item_id === "string" ? item.item_id.trim() : "";
    const received_qty = typeof item.received_qty === "number" ? item.received_qty : Number(item.received_qty);
    if (!item_id) {
      errors.push({ field: `lines[${i}].item_id`, message: "item_id is required" });
      continue;
    }
    if (!Number.isFinite(received_qty) || received_qty < 0) {
      errors.push({ field: `lines[${i}].received_qty`, message: "received_qty must be a non-negative number" });
      continue;
    }

    const row: UpdatePoLineItemDto = { item_id, received_qty };
    let lineErrors = false;
    const setPct = (field: "bm_percentage" | "ppn_percentage" | "pph_percentage", raw: unknown) => {
      if (raw === undefined) return;
      if (raw === null) {
        row[field] = null;
        return;
      }
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        errors.push({
          field: `lines[${i}].${field}`,
          message: `${field} must be between 0 and 100 or null`,
        });
        lineErrors = true;
        return;
      }
      row[field] = n;
    };
    setPct("bm_percentage", item.bm_percentage);
    setPct("ppn_percentage", item.ppn_percentage);
    setPct("pph_percentage", item.pph_percentage);
    if (lineErrors) continue;
    lines.push(row);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: { lines } };
}
