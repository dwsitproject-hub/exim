/**
 * Create shipment validation. All fields optional for minimal create.
 */

import type { Request } from "express";
import type { ErrorField } from "../../../shared/response.js";
import type { CreateShipmentDto } from "../dto/index.js";

function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v : String(v);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function validateCreateShipmentBody(
  req: Request
): { ok: true; data: CreateShipmentDto } | { ok: false; errors: ErrorField[] } {
  const body = req.body as Record<string, unknown>;
  const data: CreateShipmentDto = {};

  if (typeof body?.vendor_code === "string") data.vendor_code = body.vendor_code.trim();
  if (typeof body?.vendor_name === "string") data.vendor_name = body.vendor_name.trim();
  if (typeof body?.forwarder_code === "string") data.forwarder_code = body.forwarder_code.trim();
  if (typeof body?.forwarder_name === "string") data.forwarder_name = body.forwarder_name.trim();
  if (typeof body?.warehouse_code === "string") data.warehouse_code = body.warehouse_code.trim();
  if (typeof body?.warehouse_name === "string") data.warehouse_name = body.warehouse_name.trim();
  if (typeof body?.incoterm === "string") data.incoterm = body.incoterm.trim();
  if (typeof body?.shipment_method === "string") data.shipment_method = body.shipment_method.trim();
  if (typeof body?.origin_port_code === "string") data.origin_port_code = body.origin_port_code.trim();
  if (typeof body?.origin_port_name === "string") data.origin_port_name = body.origin_port_name.trim();
  if (typeof body?.origin_port_country === "string") data.origin_port_country = body.origin_port_country.trim();
  if (typeof body?.destination_port_code === "string") data.destination_port_code = body.destination_port_code.trim();
  if (typeof body?.destination_port_name === "string") data.destination_port_name = body.destination_port_name.trim();
  if (typeof body?.destination_port_country === "string") data.destination_port_country = body.destination_port_country.trim();
  if (typeof body?.remarks === "string") data.remarks = body.remarks.trim();
  if (body?.etd != null && parseDate(body.etd)) data.etd = typeof body.etd === "string" ? body.etd.trim() : String(body.etd);
  if (body?.eta != null && parseDate(body.eta)) data.eta = typeof body.eta === "string" ? body.eta.trim() : String(body.eta);

  if (data.etd && data.eta) {
    const etdY = data.etd.slice(0, 10);
    const etaY = data.eta.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(etdY) && /^\d{4}-\d{2}-\d{2}$/.test(etaY) && etaY <= etdY) {
      return { ok: false, errors: [{ field: "eta", message: "ETA must be after ETD" }] };
    }
  }

  return { ok: true, data };
}
