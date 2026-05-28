import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { ExportBulkingService } from "../services/export-bulking.service.js";
import { ExportBulkingRepository } from "../repositories/export-bulking.repository.js";
import type { ListExportBulkingQuery } from "../dto/index.js";

const repo = new ExportBulkingRepository();
const service = new ExportBulkingService(repo);

function userIdFromRequest(req: Request): string | undefined {
  return req.user?.id ?? req.user?.email ?? undefined;
}

/** Prefer UUID for document-number holder / regenerate checks. */
function userUuidFromRequest(req: Request): string | undefined {
  const id = req.user?.id;
  if (typeof id === "string" && id.trim().length > 0) {
    return id.trim();
  }
  return undefined;
}

function parseListQuery(req: Request): ListExportBulkingQuery {
  const q = req.query as Record<string, unknown>;
  const page = q.page != null ? parseInt(String(q.page), 10) : undefined;
  const limit = q.limit != null ? parseInt(String(q.limit), 10) : undefined;

  let statuses: string[] | undefined;
  if (typeof q.statuses === "string") {
    statuses = q.statuses.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (Array.isArray(q.statuses)) {
    statuses = (q.statuses as string[]).filter(Boolean);
  }

  return {
    page: Number.isNaN(page) ? undefined : page,
    limit: Number.isNaN(limit) ? undefined : limit,
    search: typeof q.search === "string" ? q.search : undefined,
    statuses,
    sort_by: typeof q.sort_by === "string" && q.sort_by.trim() ? q.sort_by.trim() : undefined,
    sort_dir: q.sort_dir === "asc" || q.sort_dir === "desc" ? q.sort_dir : undefined,
  };
}

/* ───────── shipment CRUD ───────── */

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.create(req.body, userIdFromRequest(req));
    sendSuccess(res, data, { message: "Export bulking shipment created", statusCode: 201 });
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

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.getById(req.params.id);
    if (!data) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function getFullDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.getFullDetail(req.params.id);
    if (!data) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    const { shipment, ...rest } = data;
    sendSuccess(res, { ...shipment, ...rest });
  } catch (e) {
    next(e);
  }
}

export async function update(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.update(req.params.id, req.body);
    if (!data) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "Shipment updated" });
  } catch (e) {
    next(e);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status } = req.body as { status?: string };
    if (!status) {
      sendError(res, "status is required", { statusCode: 400 });
      return;
    }
    const data = await service.updateStatus(req.params.id, status, userIdFromRequest(req));
    if (!data) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "Status updated" });
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Invalid status transition")) {
      sendError(res, e.message, { statusCode: 422 });
      return;
    }
    next(e);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.softDelete(req.params.id);
    if (!data) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, {}, { message: "Shipment removed" });
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

export async function getStatusEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.getStatusEvents(req.params.id);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

/* ───────── cargo lines ───────── */

export async function listCargos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.listCargoLines(req.params.id);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function upsertCargos(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const lines = Array.isArray(req.body) ? req.body : req.body?.lines;
    if (!Array.isArray(lines)) {
      sendError(res, "lines array is required", { statusCode: 400 });
      return;
    }
    const data = await service.upsertCargoLines(req.params.id, lines);
    sendSuccess(res, data, { message: "Cargo lines saved" });
  } catch (e) {
    next(e);
  }
}

export async function deleteCargo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteCargoLine(req.params.cargoId);
    sendSuccess(res, {}, { message: "Cargo line deleted" });
  } catch (e) {
    next(e);
  }
}

/* ───────── shipping instructions ───────── */

export async function listSIs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.listShippingInstructions(req.params.id);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function createSI(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.createShippingInstruction(req.params.id, req.body, userUuidFromRequest(req));
    sendSuccess(res, data, { message: "Shipping instruction created", statusCode: 201 });
  } catch (e) {
    next(e);
  }
}

export async function updateSI(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.updateShippingInstruction(req.params.siId, req.body, userUuidFromRequest(req));
    if (!data) {
      sendError(res, "Shipping instruction not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "Shipping instruction updated" });
  } catch (e) {
    next(e);
  }
}

export async function deleteSI(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteShippingInstruction(req.params.siId);
    sendSuccess(res, {}, { message: "Shipping instruction deleted" });
  } catch (e) {
    next(e);
  }
}

/* ───────── invoices ───────── */

export async function listInvoices(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.listInvoices(req.params.id);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function createInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.createInvoice(req.params.id, req.body, userUuidFromRequest(req));
    sendSuccess(res, data, { message: "Invoice created", statusCode: 201 });
  } catch (e) {
    next(e);
  }
}

export async function updateInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.updateInvoice(req.params.invId, req.body, userUuidFromRequest(req));
    if (!data) {
      sendError(res, "Invoice not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "Invoice updated" });
  } catch (e) {
    next(e);
  }
}

export async function deleteInvoice(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deleteInvoice(req.params.invId);
    sendSuccess(res, {}, { message: "Invoice deleted" });
  } catch (e) {
    next(e);
  }
}

/* ───────── packing lists ───────── */

export async function listPLs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.listPackingLists(req.params.id);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function createPL(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.createPackingList(req.params.id, req.body, userUuidFromRequest(req));
    sendSuccess(res, data, { message: "Packing list created", statusCode: 201 });
  } catch (e) {
    next(e);
  }
}

export async function updatePL(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.updatePackingList(
      req.params.plId,
      req.body,
      userUuidFromRequest(req),
      req.params.id,
    );
    if (!data) {
      sendError(res, "Packing list not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "Packing list updated" });
  } catch (e) {
    next(e);
  }
}

export async function deletePL(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.deletePackingList(req.params.plId);
    sendSuccess(res, {}, { message: "Packing list deleted" });
  } catch (e) {
    next(e);
  }
}

/* ───────── regenerate document numbers (atomic serial, holder-gated) ───────── */

export async function regenerateSINumber(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = userUuidFromRequest(req);
    if (!userId) {
      sendError(res, "Authentication required", { statusCode: 401 });
      return;
    }
    const data = await service.regenerateShippingInstructionNumber(req.params.siId, userId);
    if (!data) {
      sendError(res, "Shipping instruction not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "SI number regenerated" });
  } catch (e) {
    next(e);
  }
}

export async function regenerateInvoiceNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = userUuidFromRequest(req);
    if (!userId) {
      sendError(res, "Authentication required", { statusCode: 401 });
      return;
    }
    const data = await service.regenerateInvoiceNumber(req.params.invId, userId);
    if (!data) {
      sendError(res, "Invoice not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "Invoice number regenerated" });
  } catch (e) {
    next(e);
  }
}

export async function regeneratePackingListNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = userUuidFromRequest(req);
    if (!userId) {
      sendError(res, "Authentication required", { statusCode: 401 });
      return;
    }
    const data = await service.regeneratePackingListNumber(req.params.plId, userId);
    if (!data) {
      sendError(res, "Packing list not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data, { message: "Packing list number regenerated" });
  } catch (e) {
    next(e);
  }
}
