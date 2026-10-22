/**
 * Validation for master-data endpoints (DHM company create, exchange-rate lookup).
 */

import type { Request } from "express";
import type { ErrorField } from "../../../shared/response.js";
import type { CreateCompanyDto } from "../dto/index.js";

export function validateCreateCompanyBody(
  req: Request
): { ok: true; data: CreateCompanyDto } | { ok: false; errors: ErrorField[] } {
  const body = req.body as Record<string, unknown>;
  const errors: ErrorField[] = [];

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    errors.push({ field: "name", message: "name is required" });
  }
  if (errors.length > 0) return { ok: false, errors };

  const data: CreateCompanyDto = { name };
  if (typeof body?.short_name === "string" && body.short_name.trim()) data.short_name = body.short_name.trim();
  if (typeof body?.company_code_sap === "string" && body.company_code_sap.trim()) {
    data.company_code_sap = body.company_code_sap.trim();
  }
  if (typeof body?.country === "string" && body.country.trim()) data.country = body.country.trim().toUpperCase();
  if (typeof body?.is_active === "boolean") data.is_active = body.is_active;

  return { ok: true, data };
}

export function validateExchangeRateQuery(
  req: Request
): { ok: true; data: { from: string; to: string; date: string } } | { ok: false; errors: ErrorField[] } {
  const q = req.query as Record<string, unknown>;
  const errors: ErrorField[] = [];

  const from = typeof q?.from === "string" ? q.from.trim().toUpperCase() : "";
  const to = typeof q?.to === "string" ? q.to.trim().toUpperCase() : "";
  if (!from) errors.push({ field: "from", message: "from (currency code) is required" });
  if (!to) errors.push({ field: "to", message: "to (currency code) is required" });

  const rawDate = typeof q?.date === "string" && q.date.trim() ? q.date.trim() : new Date().toISOString().slice(0, 10);
  const date = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push({ field: "date", message: "date must be YYYY-MM-DD" });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: { from, to, date } };
}
