/**
 * Shipment status controllers: parse request, return response only.
 */

import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { validateUpdateStatusBody } from "../validators/index.js";
import { ShipmentStatusService } from "../services/shipment-status.service.js";
import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { ShipmentStatusHistoryRepository } from "../repositories/shipment-status-history.repository.js";
import { ShipmentPoMappingRepository } from "../repositories/shipment-po-mapping.repository.js";
import { ShipmentPoLineReceivedRepository } from "../repositories/shipment-po-line-received.repository.js";
import { ShipmentDocumentRepository } from "../repositories/shipment-document.repository.js";
import { ShipmentBidRepository } from "../repositories/shipment-bid.repository.js";
import { ShipmentService } from "../services/shipment.service.js";

const shipmentRepo = new ShipmentRepository();
const historyRepo = new ShipmentStatusHistoryRepository();
const mappingRepo = new ShipmentPoMappingRepository();
const lineReceivedRepo = new ShipmentPoLineReceivedRepository();
const shipmentService = new ShipmentService(shipmentRepo, mappingRepo, lineReceivedRepo);
const documentRepo = new ShipmentDocumentRepository();
const bidRepo = new ShipmentBidRepository();
const service = new ShipmentStatusService(
  shipmentRepo,
  historyRepo,
  shipmentService,
  documentRepo,
  bidRepo
);

export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  const validation = validateUpdateStatusBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  const changedBy = req.user?.name ?? "System";
  try {
    const data = await service.updateStatus(
      id,
      validation.data.new_status,
      validation.data.remarks ?? null,
      changedBy
    );
    sendSuccess(res, data, { message: "Shipment status updated successfully" });
  } catch (e) {
    next(e);
  }
}

export async function getTimeline(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  try {
    const data = await service.getTimeline(id);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function getStatusSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  try {
    const data = await service.getStatusSummary(id);
    if (!data) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}
