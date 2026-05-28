/**
 * Shipment controllers: parse request, return response only.
 */

import type { Request, Response, NextFunction } from "express";
import { mergeFilterTokens } from "../../../shared/http-query-multi.js";
import { sendSuccess, sendError } from "../../../shared/response.js";
import {
  validateCreateShipmentBody,
  validateUpdateShipmentBody,
  validateCloseShipmentBody,
  validateCouplePoBody,
  validateDecouplePoBody,
  validateUpdatePoMappingBody,
  validateUpdatePoLinesBody,
} from "../validators/index.js";
import { ShipmentService } from "../services/shipment.service.js";
import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { ShipmentPoMappingRepository } from "../repositories/shipment-po-mapping.repository.js";
import { ShipmentPoLineReceivedRepository } from "../repositories/shipment-po-line-received.repository.js";
import type { ListShipmentsQuery } from "../dto/index.js";
import { readMulterFileAsUtf8 } from "../../../utils/read-multer-upload.js";

function actorFromRequest(req: Request): string {
  const name = req.user?.name?.trim();
  if (name) return name;
  const email = req.user?.email?.trim();
  if (email) return email;
  return "Unknown user";
}

const shipmentRepo = new ShipmentRepository();
const mappingRepo = new ShipmentPoMappingRepository();
const lineReceivedRepo = new ShipmentPoLineReceivedRepository();
const service = new ShipmentService(shipmentRepo, mappingRepo, lineReceivedRepo);

function parseListQuery(req: Request): ListShipmentsQuery {
  const q = req.query as Record<string, unknown>;
  const page = q.page != null ? parseInt(String(q.page), 10) : undefined;
  const limit = q.limit != null ? parseInt(String(q.limit), 10) : undefined;
  return {
    page: Number.isNaN(page) ? undefined : page,
    limit: Number.isNaN(limit) ? undefined : limit,
    search: typeof q.search === "string" ? q.search : undefined,
    status: typeof q.status === "string" ? q.status : undefined,
    supplier_name: typeof q.supplier_name === "string" ? q.supplier_name : undefined,
    po_number: typeof q.po_number === "string" ? q.po_number : undefined,
    from_date: typeof q.from_date === "string" ? q.from_date : undefined,
    to_date: typeof q.to_date === "string" ? q.to_date : undefined,
    po_from_date: typeof q.po_from_date === "string" ? q.po_from_date : undefined,
    po_to_date: typeof q.po_to_date === "string" ? q.po_to_date : undefined,
    active_pipeline:
      q.active_pipeline === "true" || q.active_pipeline === "1" || q.active_pipeline === true ? true : undefined,
    created_from: typeof q.created_from === "string" ? q.created_from : undefined,
    created_to: typeof q.created_to === "string" ? q.created_to : undefined,
    pts: mergeFilterTokens(q, "pt", "pts_in"),
    plants: mergeFilterTokens(q, "plant", "plants_in"),
    product_classifications: mergeFilterTokens(q, "product_classification", "product_classifications_in"),
    shipment_method: typeof q.shipment_method === "string" ? q.shipment_method : undefined,
    vendor_names_exact: mergeFilterTokens(q, "vendor_name_exact", "vendor_names_in"),
    statuses: mergeFilterTokens(q, "statuses", "statuses_in"),
    shipment_nos: mergeFilterTokens(q, "shipment_no", "shipment_nos_in"),
    po_numbers: mergeFilterTokens(q, "po_number_exact", "po_numbers_in"),
    incoterms: mergeFilterTokens(q, "incoterm", "incoterms_in"),
    pib_types: mergeFilterTokens(q, "pib_type", "pib_types_in"),
    shipment_methods: mergeFilterTokens(q, "shipment_method_multi", "shipment_methods_in"),
    ship_bys: mergeFilterTokens(q, "ship_by", "ship_bys_in"),
    forwarder_names: mergeFilterTokens(q, "forwarder_name", "forwarder_names_in"),
    pic_names: mergeFilterTokens(q, "pic_name", "pic_names_in"),
    etd_dates: mergeFilterTokens(q, "etd_date", "etd_dates_in"),
    eta_dates: mergeFilterTokens(q, "eta_date", "eta_dates_in"),
    origin_port_names: mergeFilterTokens(q, "origin_port_name", "origin_port_names_in"),
    destination_port_names: mergeFilterTokens(q, "destination_port_name", "destination_port_names_in"),
    dormant_remaining_qty:
      q.dormant_remaining_qty === "true" || q.dormant_remaining_qty === "1" ? true : undefined,
    dormant_days: (() => {
      const n = q.dormant_days != null ? parseInt(String(q.dormant_days), 10) : undefined;
      return n != null && !Number.isNaN(n) && n > 0 ? n : undefined;
    })(),
    performance_eta_late:
      q.performance_eta_late === "true" || q.performance_eta_late === "1" ? true : undefined,
    sort_by: typeof q.sort_by === "string" && q.sort_by.trim() ? q.sort_by.trim() : undefined,
    sort_dir: q.sort_dir === "asc" || q.sort_dir === "desc" ? q.sort_dir : undefined,
  };
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateCreateShipmentBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const data = await service.create(validation.data, actorFromRequest(req));
    sendSuccess(res, data, { message: "Shipment created successfully", statusCode: 201 });
  } catch (e) {
    next(e);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = parseListQuery(req);
    const { items, total } = await service.list(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    sendSuccess(res, items, { meta: { page, limit, total } });
  } catch (e) {
    next(e);
  }
}

export async function listFilterOptions(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.listFilterOptions();
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  try {
    const data = await service.getById(id);
    if (!data) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  const validation = validateUpdateShipmentBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const data = await service.update(id, validation.data, actorFromRequest(req));
    if (!data) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "Shipment updated successfully" });
  } catch (e) {
    next(e);
  }
}

export async function close(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  const dto = validateCloseShipmentBody(req);
  try {
    await service.close(id, dto.reason ?? null);
    sendSuccess(res, {}, { message: "Shipment closed successfully" });
  } catch (e) {
    next(e);
  }
}

export async function softDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  try {
    await service.softDelete(id, actorFromRequest(req));
    sendSuccess(res, {}, { message: "Shipment removed successfully" });
  } catch (e) {
    next(e);
  }
}

export async function couplePo(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const validation = validateCouplePoBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  const coupledBy = req.user?.name ?? "System";
  try {
    const data = await service.couplePo(shipmentId, validation.data.intake_ids, coupledBy);
    sendSuccess(res, data ?? {}, { message: "PO(s) coupled to shipment successfully" });
  } catch (e) {
    next(e);
  }
}

export async function decouplePo(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const validation = validateDecouplePoBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  const decoupledBy = req.user?.name ?? "System";
  try {
    await service.decouplePo(shipmentId, validation.data.intake_id, decoupledBy, validation.data.reason ?? null);
    sendSuccess(res, {}, { message: "PO decoupled from shipment successfully" });
  } catch (e) {
    next(e);
  }
}

export async function listLinkedPos(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  try {
    const data = await service.getById(id);
    if (!data) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data.linked_pos);
  } catch (e) {
    next(e);
  }
}

export async function updatePoMapping(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const intakeId = req.params.intakeId as string;
  const validation = validateUpdatePoMappingBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const data = await service.updatePoMapping(shipmentId, intakeId, validation.data);
    if (!data) {
      sendError(res, "Shipment or linked PO not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "Linked PO updated successfully" });
  } catch (e) {
    next(e);
  }
}

export async function updatePoLines(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const intakeId = req.params.intakeId as string;
  const validation = validateUpdatePoLinesBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const { lines } = validation.data;
    const data = await service.updatePoLines(shipmentId, intakeId, lines);
    if (!data) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "Received quantities updated successfully" });
  } catch (e) {
    next(e);
  }
}

export async function downloadCombinedImportTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const csv = service.getCombinedImportTemplateCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="monitoring-data-v2-template.csv"');
    res.status(200).send(csv);
  } catch (e) {
    next(e);
  }
}

export async function importCombinedCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let csvText = "";
    if (req.file) {
      csvText = await readMulterFileAsUtf8(req.file);
    }
    if (!csvText.trim() && typeof req.body?.csv_text === "string") {
      csvText = req.body.csv_text;
    }
    if (!csvText.trim()) {
      sendError(res, "CSV file is required", { statusCode: 400 });
      return;
    }
    const actorName = actorFromRequest(req);
    const result = await service.importCombinedFromCsv(csvText, actorName, req.file?.originalname ?? null);
    sendSuccess(res, result, {
      message: result.errors.length > 0 ? "Combined CSV imported with warnings" : "Combined CSV imported successfully",
    });
  } catch (e) {
    next(e);
  }
}

export async function listShipmentImportHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawLimit = Number.parseInt(String(req.query.limit ?? "20"), 10);
    const limit = Number.isNaN(rawLimit) ? 20 : rawLimit;
    const rows = await service.listShipmentImportHistory(limit);
    sendSuccess(res, rows);
  } catch (e) {
    next(e);
  }
}
