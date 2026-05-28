import type { Request } from "express";
import type { ErrorField } from "../../../shared/response.js";
import type { CreateShipmentBidDto } from "../dto/index.js";
import { normalizeFreightChargeCurrency } from "../../../shared/freight-currency.js";

function parseDateOnlyYmd(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function validateCreateBidBody(
  req: Request
): { ok: true; data: CreateShipmentBidDto } | { ok: false; errors: ErrorField[] } {
  const body = req.body as Record<string, unknown>;
  const errors: ErrorField[] = [];

  const forwarder_name = typeof body?.forwarder_name === "string" ? body.forwarder_name.trim() : "";
  if (!forwarder_name) {
    errors.push({ field: "forwarder_name", message: "Forwarder name is required" });
  }

  if (body?.quotation_expires_at != null && String(body.quotation_expires_at).trim() !== "") {
    const parsed =
      typeof body.quotation_expires_at === "string"
        ? parseDateOnlyYmd(body.quotation_expires_at)
        : null;
    if (!parsed) {
      errors.push({ field: "quotation_expires_at", message: "Use a valid date (YYYY-MM-DD)" });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const data: CreateShipmentBidDto = { forwarder_name };
  if (body?.service_amount != null) {
    const n = Number(body.service_amount);
    if (Number.isFinite(n) && n >= 0) data.service_amount = n;
  }
  if (body?.service_amount_currency != null && String(body.service_amount_currency).trim() !== "") {
    const cur = normalizeFreightChargeCurrency(body.service_amount_currency);
    if (!cur) errors.push({ field: "service_amount_currency", message: "Must be USD or IDR" });
    else data.service_amount_currency = cur;
  }
  if (typeof body?.duration === "string") data.duration = body.duration.trim() || undefined;
  if (typeof body?.origin_port === "string") data.origin_port = body.origin_port.trim() || undefined;
  if (typeof body?.destination_port === "string") data.destination_port = body.destination_port.trim() || undefined;
  if (typeof body?.ship_via === "string") data.ship_via = body.ship_via.trim() || undefined;
  if (typeof body?.quotation_expires_at === "string" && body.quotation_expires_at.trim() !== "") {
    const parsed = parseDateOnlyYmd(body.quotation_expires_at);
    if (parsed) data.quotation_expires_at = parsed;
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, data };
}
