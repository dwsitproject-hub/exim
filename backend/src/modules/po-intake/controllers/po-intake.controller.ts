/**
 * PO intake controllers: parse request, return response only.
 */

import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError } from "../../../shared/response.js";
import {
  validateCreateIntakeBody,
  validateCoupleToShipmentBody,
  validateUpdatePoIntakeBody,
} from "../validators/index.js";
import { PoIntakeService } from "../services/po-intake.service.js";
import { PoIntakeRepository } from "../repositories/po-intake.repository.js";
import { ShipmentService } from "../../shipments/services/shipment.service.js";
import { ShipmentRepository } from "../../shipments/repositories/shipment.repository.js";
import { ShipmentPoMappingRepository } from "../../shipments/repositories/shipment-po-mapping.repository.js";
import { UserRepository } from "../../auth/repositories/user.repository.js";
import type { ListPoIntakeQuery } from "../dto/index.js";
import { mergeFilterTokens } from "../../../shared/http-query-multi.js";
import { readMulterFileAsUtf8 } from "../../../utils/read-multer-upload.js";

const repo = new PoIntakeRepository();
const mappingRepo = new ShipmentPoMappingRepository();
const userRepo = new UserRepository();
const service = new PoIntakeService(repo, mappingRepo, userRepo);
const shipmentRepo = new ShipmentRepository();
const shipmentService = new ShipmentService(shipmentRepo, mappingRepo);

function parseListQuery(req: Request): ListPoIntakeQuery {
  const q = req.query as Record<string, unknown>;
  const page = q.page != null ? parseInt(String(q.page), 10) : undefined;
  const limit = q.limit != null ? parseInt(String(q.limit), 10) : undefined;
  const detectedOlder = q.detected_older_than_days != null ? parseInt(String(q.detected_older_than_days), 10) : undefined;
  const hasLinkedRaw = q.has_linked_shipment;
  const has_linked_shipment =
    hasLinkedRaw === "true" || hasLinkedRaw === "1"
      ? true
      : hasLinkedRaw === "false" || hasLinkedRaw === "0"
        ? false
        : undefined;
  return {
    page: Number.isNaN(page) ? undefined : page,
    limit: Number.isNaN(limit) ? undefined : limit,
    search: typeof q.search === "string" ? q.search : undefined,
    intake_status: typeof q.intake_status === "string" ? q.intake_status : undefined,
    po_number: typeof q.po_number === "string" ? q.po_number : undefined,
    unclaimed_only: q.unclaimed_only === "true" || q.unclaimed_only === "1" ? true : undefined,
    has_linked_shipment,
    detected_older_than_days:
      detectedOlder != null && !Number.isNaN(detectedOlder) && detectedOlder > 0 ? detectedOlder : undefined,
    po_numbers: mergeFilterTokens(q, "po_number_exact", "po_numbers_in"),
    external_ids: mergeFilterTokens(q, "external_id", "external_ids_in"),
    pts: mergeFilterTokens(q, "pt", "pts_in"),
    plants: mergeFilterTokens(q, "plant", "plants_in"),
    supplier_names: mergeFilterTokens(q, "supplier_name", "supplier_names_in"),
    delivery_locations: mergeFilterTokens(q, "delivery_location", "delivery_locations_in"),
    incoterm_locations: mergeFilterTokens(q, "incoterm_location", "incoterm_locations_in"),
    kawasan_berikats: mergeFilterTokens(q, "kawasan_berikat", "kawasan_berikats_in"),
    currencies: mergeFilterTokens(q, "currency", "currencies_in"),
    intake_statuses: mergeFilterTokens(q, "intake_statuses", "intake_statuses_in"),
    taken_by_user_ids: mergeFilterTokens(q, "taken_by_user_id", "taken_by_user_ids_in"),
    taken_by_names: mergeFilterTokens(q, "taken_by_name", "taken_by_names_in"),
    taken_at_dates: mergeFilterTokens(q, "taken_at_date", "taken_at_dates_in"),
    created_at_dates: mergeFilterTokens(q, "created_at_date", "created_at_dates_in"),
    updated_at_dates: mergeFilterTokens(q, "updated_at_date", "updated_at_dates_in"),
    sort_by: typeof q.sort_by === "string" && q.sort_by.trim() ? q.sort_by.trim() : undefined,
    sort_dir: q.sort_dir === "asc" || q.sort_dir === "desc" ? q.sort_dir : undefined,
  };
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateCreateIntakeBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const createdByUserId = req.user?.id ?? null;
    const data = await service.create(validation.data, { createdByUserId });
    sendSuccess(res, data, { message: "PO intake created successfully", statusCode: 201 });
  } catch (e) {
    next(e);
  }
}

/** GET /po/lookup-by-po-number?po_number= — resolve intake UUID for coupling by PO number. */
export async function lookupByPoNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = typeof req.query.po_number === "string" ? req.query.po_number.trim() : "";
  if (!raw) {
    sendError(res, "po_number query parameter is required", { statusCode: 400 });
    return;
  }
  try {
    const id = await repo.findIdByPoNumberTrimmed(raw);
    if (!id) {
      sendError(res, "No purchase order found with this PO number", { statusCode: 404 });
      return;
    }
    sendSuccess(res, { id });
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

/** GET /po/list-filter-options — distinct column values for filters (full database). */
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
      sendError(res, "PO intake not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function updateIntake(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  const validation = validateUpdatePoIntakeBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const actorName =
      req.user?.name?.trim() ||
      req.user?.email?.trim() ||
      (req.user?.id != null ? String(req.user.id) : "") ||
      "Unknown";
    const detail = await service.updateIntake(id, validation.data, actorName);
    if (!detail) {
      sendError(res, "PO intake not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, detail, { message: "Purchase Order updated" });
  } catch (e) {
    next(e);
  }
}

export async function takeOwnership(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  const userId = req.user?.id ?? req.user?.name ?? "unknown";
  try {
    const data = await service.takeOwnership(id, userId);
    if (!data) {
      sendError(res, "PO intake not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "PO claimed successfully" });
  } catch (e) {
    next(e);
  }
}

function actorDisplayName(req: Request): string {
  const name = req.user?.name?.trim();
  if (name) return name;
  const email = req.user?.email?.trim();
  if (email) return email;
  const idRaw = req.user?.id;
  if (idRaw != null && String(idRaw).trim() !== "") return String(idRaw).trim();
  return "System";
}

/** POST /po/:id/create-shipment — create a new shipment and couple this intake to it. */
export async function createShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
  const intakeId = req.params.id as string;
  const userName = actorDisplayName(req);
  try {
    const intake = await service.getById(intakeId);
    if (!intake) {
      sendError(res, "PO intake not found", { statusCode: 404 });
      return;
    }
    // Pre-fill shipment from PO: vendor/supplier, delivery location, incoterm, kawasan berikat
    const createDto = {
      vendor_name: intake.supplier_name ?? undefined,
      warehouse_name: intake.delivery_location ?? undefined,
      incoterm: intake.incoterm_location ?? undefined,
      kawasan_berikat: intake.kawasan_berikat ?? undefined,
    };
    const created = await shipmentService.create(createDto, userName);
    const shipment = await shipmentService.couplePo(created.id, [intakeId], userName);
    sendSuccess(
      res,
      { shipment_id: created.id, shipment_number: created.shipment_number, shipment: shipment ?? undefined },
      { message: "Shipment created and PO coupled successfully", statusCode: 201 }
    );
  } catch (e) {
    next(e);
  }
}

/** POST /po/:id/couple-to-shipment — couple this intake to an existing shipment. */
export async function coupleToShipment(req: Request, res: Response, next: NextFunction): Promise<void> {
  const intakeId = req.params.id as string;
  const validation = validateCoupleToShipmentBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  const userName = actorDisplayName(req);
  try {
    const intake = await service.getById(intakeId);
    if (!intake) {
      sendError(res, "PO intake not found", { statusCode: 404 });
      return;
    }
    const shipment = await shipmentService.couplePo(validation.data.shipment_id, [intakeId], userName);
    sendSuccess(res, shipment ?? {}, { message: "PO coupled to shipment successfully" });
  } catch (e) {
    next(e);
  }
}

export async function downloadImportTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const csv = service.getImportTemplateCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="monitoring-data-template.csv"');
    res.status(200).send(csv);
  } catch (e) {
    next(e);
  }
}

export async function importCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let csvText = "";
    const file = req.file;
    if (file) csvText = await readMulterFileAsUtf8(file);
    else if (typeof req.body?.csv_text === "string") csvText = req.body.csv_text;
    if (!csvText.trim()) {
      sendError(res, "CSV file is required", { statusCode: 400 });
      return;
    }
    const actorName = req.user?.name ?? req.user?.id ?? "system";
    const createdByUserId = req.user?.id ?? null;
    const result = await service.importFromCsv(csvText, actorName, file?.originalname ?? null, createdByUserId);
    sendSuccess(res, result, {
      message: result.errors.length > 0 ? "CSV imported with warnings" : "CSV imported successfully",
      statusCode: 200,
    });
  } catch (e) {
    next(e);
  }
}

export async function listImportHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawLimit = Number.parseInt(String(req.query.limit ?? "20"), 10);
    const limit = Number.isNaN(rawLimit) ? 20 : rawLimit;
    const rows = await service.listImportHistory(limit);
    sendSuccess(res, rows);
  } catch (e) {
    next(e);
  }
}
