/**
 * Update shipment validation (partial).
 */

import type { Request } from "express";
import type { ErrorField } from "../../../shared/response.js";
import type { UpdateShipmentDto } from "../dto/index.js";
import { normalizeFreightChargeCurrency } from "../../../shared/freight-currency.js";

function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v : String(v);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function validateUpdateShipmentBody(
  req: Request
): { ok: true; data: UpdateShipmentDto } | { ok: false; errors: ErrorField[] } {
  const body = req.body as Record<string, unknown>;
  const errors: ErrorField[] = [];

  const etaRaw = body?.eta;
  if (etaRaw != null) {
    if (typeof etaRaw !== "string" || !parseDate(etaRaw)) {
      errors.push({ field: "eta", message: "ETA must be a valid date" });
    }
  }
  const etdRaw = body?.etd;
  if (etdRaw != null) {
    if (typeof etdRaw !== "string" || !parseDate(etdRaw)) {
      errors.push({ field: "etd", message: "ETD must be a valid date" });
    }
  }
  const closedAtRaw = body?.closed_at;
  if (closedAtRaw != null) {
    if (typeof closedAtRaw !== "string" || !parseDate(closedAtRaw)) {
      errors.push({ field: "closed_at", message: "Delivered at must be a valid date" });
    }
  }
  const atdRaw = body?.atd;
  if (atdRaw != null) {
    if (typeof atdRaw !== "string" || !parseDate(atdRaw)) {
      errors.push({ field: "atd", message: "ATD must be a valid date" });
    }
  }
  const ataRaw = body?.ata;
  if (ataRaw != null) {
    if (typeof ataRaw !== "string" || !parseDate(ataRaw)) {
      errors.push({ field: "ata", message: "ATA must be a valid date" });
    }
  }

  const etdStr = typeof etdRaw === "string" ? etdRaw.trim() : "";
  const etaStr = typeof etaRaw === "string" ? etaRaw.trim() : "";
  if (etdStr && etaStr) {
    const etdD = parseDate(etdStr);
    const etaD = parseDate(etaStr);
    if (etdD && etaD && etaD.getTime() <= etdD.getTime()) {
      errors.push({ field: "eta", message: "ETA must be after ETD" });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const data: UpdateShipmentDto = {};
  if (etdRaw != null && typeof etdRaw === "string") data.etd = etdRaw.trim();
  if (etaRaw != null && typeof etaRaw === "string") data.eta = etaRaw.trim();
  if (atdRaw != null && typeof atdRaw === "string") data.atd = atdRaw.trim();
  if (ataRaw != null && typeof ataRaw === "string") data.ata = ataRaw.trim();
  if (body?.depo !== undefined && body?.depo !== null) {
    if (typeof body.depo === "boolean") data.depo = body.depo;
    else errors.push({ field: "depo", message: "depo must be a boolean" });
  }
  if (typeof body?.depo_location === "string") data.depo_location = body.depo_location.trim() || null;
  else if (body?.depo_location === null) data.depo_location = null;
  if (typeof body?.remarks === "string") data.remarks = body.remarks.trim();
  if (typeof body?.pib_type === "string") data.pib_type = body.pib_type.trim() || undefined;
  if (typeof body?.no_request_pib === "string") data.no_request_pib = body.no_request_pib.trim() || undefined;
  if (typeof body?.ppjk_mkl === "string") data.ppjk_mkl = body.ppjk_mkl.trim() || undefined;
  if (typeof body?.nopen === "string") data.nopen = body.nopen.trim() || undefined;
  if (body?.nopen_date != null) {
    const nd = typeof body.nopen_date === "string" ? body.nopen_date.trim() : "";
    data.nopen_date = nd || undefined;
  }
  if (body?.ship_by === null) data.ship_by = null;
  else if (typeof body?.ship_by === "string") data.ship_by = body.ship_by.trim() || null;
  if (typeof body?.bl_awb === "string") data.bl_awb = body.bl_awb.trim() || undefined;
  if (typeof body?.insurance_no === "string") data.insurance_no = body.insurance_no.trim() || undefined;
  if (typeof body?.coo === "string") data.coo = body.coo.trim() || undefined;
  if (body?.incoterm_amount != null) {
    const n = Number(body.incoterm_amount);
    if (!Number.isFinite(n) || n < 0) errors.push({ field: "incoterm_amount", message: "Must be a non-negative number" });
    else data.incoterm_amount = n;
  }
  if (body?.incoterm_currency != null && String(body.incoterm_currency).trim() !== "") {
    const cur = normalizeFreightChargeCurrency(body.incoterm_currency);
    if (!cur) errors.push({ field: "incoterm_currency", message: "Must be USD or IDR" });
    else data.incoterm_currency = cur;
  }
  if (body?.cbm === null) {
    data.cbm = null;
  } else if (body?.cbm !== undefined && body?.cbm !== null) {
    const n = Number(body.cbm);
    if (!Number.isFinite(n) || n < 0) errors.push({ field: "cbm", message: "Must be a non-negative number" });
    else data.cbm = n;
  }
  if (body?.net_weight_mt != null) {
    const n = Number(body.net_weight_mt);
    if (!Number.isFinite(n) || n < 0) errors.push({ field: "net_weight_mt", message: "Must be a non-negative number" });
    else data.net_weight_mt = n;
  }
  if (body?.gross_weight_mt != null) {
    const n = Number(body.gross_weight_mt);
    if (!Number.isFinite(n) || n < 0) errors.push({ field: "gross_weight_mt", message: "Must be a non-negative number" });
    else data.gross_weight_mt = n;
  }
  if (body?.bm === null) {
    data.bm = 0;
  } else if (body?.bm !== undefined) {
    const n = Number(body.bm);
    if (!Number.isFinite(n) || n < 0) errors.push({ field: "bm", message: "Must be a non-negative number" });
    else data.bm = n;
  }
  if (body?.ppn_amount === null) {
    data.ppn_amount = 0;
  } else if (body?.ppn_amount !== undefined) {
    const n = Number(body.ppn_amount);
    if (!Number.isFinite(n) || n < 0) errors.push({ field: "ppn_amount", message: "Must be a non-negative number" });
    else data.ppn_amount = n;
  }
  if (body?.pph_amount === null) {
    data.pph_amount = 0;
  } else if (body?.pph_amount !== undefined) {
    const n = Number(body.pph_amount);
    if (!Number.isFinite(n) || n < 0) errors.push({ field: "pph_amount", message: "Must be a non-negative number" });
    else data.pph_amount = n;
  }
  if (typeof body?.origin_port_name === "string") data.origin_port_name = body.origin_port_name.trim() || undefined;
  if (typeof body?.origin_port_country === "string") data.origin_port_country = body.origin_port_country.trim() || undefined;
  if (typeof body?.forwarder_name === "string") data.forwarder_name = body.forwarder_name.trim() || undefined;
  if (typeof body?.shipment_method === "string") data.shipment_method = body.shipment_method.trim() || undefined;
  if (typeof body?.destination_port_name === "string") data.destination_port_name = body.destination_port_name.trim() || undefined;
  if (typeof body?.destination_port_country === "string") data.destination_port_country = body.destination_port_country.trim() || undefined;
  if (typeof body?.vendor_name === "string") data.vendor_name = body.vendor_name.trim() || undefined;
  if (typeof body?.warehouse_name === "string") data.warehouse_name = body.warehouse_name.trim() || undefined;
  if (typeof body?.incoterm === "string") data.incoterm = body.incoterm.trim() || undefined;
  if (body?.kawasan_berikat === null) {
    data.kawasan_berikat = null;
  } else if (typeof body?.kawasan_berikat === "string") {
    const t = body.kawasan_berikat.trim();
    if (t === "") data.kawasan_berikat = undefined;
    else if (t === "Yes" || t === "No") data.kawasan_berikat = t;
    else errors.push({ field: "kawasan_berikat", message: "Kawasan berikat must be Yes or No" });
  }
  if (body?.surveyor === null) {
    data.surveyor = null;
  } else if (typeof body?.surveyor === "string") {
    const t = body.surveyor.trim();
    if (t === "") data.surveyor = undefined;
    else if (t === "Yes" || t === "No") data.surveyor = t;
    else errors.push({ field: "surveyor", message: "Surveyor must be Yes or No" });
  }
  if (typeof body?.product_classification === "string") {
    data.product_classification = body.product_classification.trim() || null;
  } else if (body?.product_classification === null) {
    data.product_classification = null;
  }
  if (closedAtRaw != null && typeof closedAtRaw === "string") data.closed_at = closedAtRaw.trim();
  if (typeof body?.close_reason === "string") data.close_reason = body.close_reason.trim() || undefined;

  const boolFields = ["unit_20ft", "unit_40ft", "unit_package", "unit_20_iso_tank"] as const;
  for (const key of boolFields) {
    const v = body?.[key];
    if (v === undefined) continue;
    if (typeof v === "boolean") data[key] = v;
    else errors.push({ field: key, message: `${key} must be a boolean` });
  }

  const parseCount = (raw: unknown, field: string): number | null | undefined => {
    if (raw === undefined) return undefined;
    if (raw === null) return null;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      errors.push({ field, message: "Must be a non-negative integer" });
      return undefined;
    }
    return n;
  };
  const c20 = parseCount(body?.container_count_20ft, "container_count_20ft");
  if (c20 !== undefined) data.container_count_20ft = c20;
  const c40 = parseCount(body?.container_count_40ft, "container_count_40ft");
  if (c40 !== undefined) data.container_count_40ft = c40;
  const pkg = parseCount(body?.package_count, "package_count");
  if (pkg !== undefined) data.package_count = pkg;
  const cIso = parseCount(body?.container_count_20_iso_tank, "container_count_20_iso_tank");
  if (cIso !== undefined) data.container_count_20_iso_tank = cIso;

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, data };
}

