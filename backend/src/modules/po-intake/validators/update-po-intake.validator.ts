/**
 * PATCH /po/:id body validation (edit PO header + lines).
 */

import type { Request } from "express";
import type { ErrorField } from "../../../shared/response.js";
import type { UpdatePoIntakeDto } from "../dto/index.js";
import { PO_ITEM_UNIT_OPTION_SET } from "../../../shared/po-item-units.js";

type ParsedItem = {
  id?: string;
  line_number?: number;
  item_description?: string;
  qty?: number;
  unit?: string;
  value?: number;
};

function parseItems(body: unknown): ParsedItem[] {
  if (!Array.isArray(body)) return [];
  return body.map((item): ParsedItem => {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const idRaw = o.id;
    return {
      id: typeof idRaw === "string" && idRaw.trim() ? idRaw.trim() : undefined,
      line_number: typeof o.line_number === "number" ? o.line_number : undefined,
      item_description: typeof o.item_description === "string" ? o.item_description : undefined,
      qty: typeof o.qty === "number" ? o.qty : undefined,
      unit: typeof o.unit === "string" ? o.unit : undefined,
      value: typeof o.value === "number" ? o.value : undefined,
    };
  });
}

export function validateUpdatePoIntakeBody(
  req: Request
): { ok: true; data: UpdatePoIntakeDto } | { ok: false; errors: ErrorField[] } {
  const body = req.body as Record<string, unknown>;
  const errors: ErrorField[] = [];

  const po_number = typeof body?.po_number === "string" ? body.po_number.trim() : "";
  if (!po_number) errors.push({ field: "po_number", message: "po_number is required" });

  const supplier_name = typeof body?.supplier_name === "string" ? body.supplier_name.trim() : "";
  if (!supplier_name) errors.push({ field: "supplier_name", message: "supplier_name is required" });

  const rawItems = parseItems(body?.items);
  if (rawItems.length === 0) {
    errors.push({
      field: "items",
      message: "At least one line item is required (description, quantity > 0, unit, value ≥ 0).",
    });
  } else {
    rawItems.forEach((it, index) => {
      const prefix = `items[${index}]`;
      const desc = (it.item_description ?? "").trim();
      if (!desc) errors.push({ field: prefix, message: "item_description is required" });
      const qty = it.qty;
      if (qty == null || !Number.isFinite(qty) || qty <= 0) {
        errors.push({ field: prefix, message: "qty must be a number greater than 0" });
      }
      const unit = (it.unit ?? "").trim();
      if (!unit) errors.push({ field: prefix, message: "unit is required" });
      else if (!PO_ITEM_UNIT_OPTION_SET.has(unit)) {
        errors.push({ field: prefix, message: "unit must be a supported unit code" });
      }
      const value = it.value;
      if (value == null || !Number.isFinite(value) || value < 0) {
        errors.push({ field: prefix, message: "value must be a number ≥ 0" });
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const data: UpdatePoIntakeDto = {
    po_number,
    supplier_name,
    items: rawItems.map((it, i) => ({
      id: it.id,
      line_number: it.line_number ?? i + 1,
      item_description: (it.item_description ?? "").trim(),
      qty: it.qty!,
      unit: (it.unit ?? "").trim(),
      value: it.value!,
    })),
  };
  if (typeof body?.plant === "string") data.plant = body.plant.trim();
  if (typeof body?.pt === "string") data.pt = body.pt.trim();
  if (typeof body?.delivery_location === "string") data.delivery_location = body.delivery_location.trim();
  if (typeof body?.incoterm_location === "string") data.incoterm_location = body.incoterm_location.trim();
  if (typeof body?.kawasan_berikat === "string") {
    const t = body.kawasan_berikat.trim();
    if (t) {
      if (/^yes$/i.test(t)) data.kawasan_berikat = "Yes";
      else if (/^no$/i.test(t)) data.kawasan_berikat = "No";
      else data.kawasan_berikat = t;
    }
  }
  if (typeof body?.currency === "string") data.currency = body.currency.trim();

  return { ok: true, data };
}
