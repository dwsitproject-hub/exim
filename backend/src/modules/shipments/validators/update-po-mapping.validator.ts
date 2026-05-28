/**
 * Update linked PO mapping (invoice_no, currency_rate).
 */

import type { Request } from "express";
import type { ErrorField } from "../../../shared/response.js";

export interface UpdatePoMappingDto {
  invoice_no?: string | null;
  currency_rate?: number | null;
}

export function validateUpdatePoMappingBody(
  req: Request
): { ok: true; data: UpdatePoMappingDto } | { ok: false; errors: ErrorField[] } {
  const body = req.body as Record<string, unknown>;
  const errors: ErrorField[] = [];
  const data: UpdatePoMappingDto = {};
  if (body?.invoice_no !== undefined) {
    data.invoice_no = typeof body.invoice_no === "string" ? body.invoice_no.trim() || null : null;
  }
  if (body?.currency_rate !== undefined) {
    if (body.currency_rate === null) {
      data.currency_rate = null;
    } else {
      const n = Number(body.currency_rate);
      if (!Number.isFinite(n) || n < 0) {
        errors.push({ field: "currency_rate", message: "currency_rate must be a non-negative number or null" });
      } else {
        data.currency_rate = n;
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data };
}
