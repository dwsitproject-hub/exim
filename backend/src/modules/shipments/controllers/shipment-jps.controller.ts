/**
 * Jetty (JPS) master data + explicit sync endpoints for import shipments.
 */

import type { NextFunction, Request, Response } from "express";
import {
  getJpsCommodities,
  getJpsPorts,
  getJpsSyncService,
  isJpsConfigReady,
} from "../../../integration/jps/index.js";
import { sendError, sendSuccess } from "../../../shared/response.js";
import { ShipmentService } from "../services/shipment.service.js";
import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { ShipmentPoMappingRepository } from "../repositories/shipment-po-mapping.repository.js";
import { ShipmentPoLineReceivedRepository } from "../repositories/shipment-po-line-received.repository.js";

const shipmentService = new ShipmentService(
  new ShipmentRepository(),
  new ShipmentPoMappingRepository(),
  new ShipmentPoLineReceivedRepository()
);

function actorEmail(req: Request): string | null {
  return req.user?.email?.trim() || req.user?.name?.trim() || null;
}

export async function listJpsPorts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!isJpsConfigReady()) {
      sendError(res, "JPS sync is not configured", { statusCode: 503 });
      return;
    }
    const forceRefresh = String(req.query.refresh ?? "") === "1";
    const result = await getJpsPorts({ forceRefresh });
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
}

export async function listJpsCommodities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!isJpsConfigReady()) {
      sendError(res, "JPS sync is not configured", { statusCode: 503 });
      return;
    }
    const forceRefresh = String(req.query.refresh ?? "") === "1";
    const result = await getJpsCommodities({ forceRefresh });
    sendSuccess(res, result);
  } catch (e) {
    next(e);
  }
}

export async function previewJpsSync(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const id = req.params.id as string;
  try {
    const preview = await getJpsSyncService().getPreview(id, actorEmail(req));
    sendSuccess(res, preview);
  } catch (e) {
    next(e);
  }
}

export async function syncJpsNow(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = req.params.id as string;
  try {
    await getJpsSyncService().syncNow(id, actorEmail(req));
    const detail = await shipmentService.getById(id);
    if (!detail) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, detail, { message: "Jetty sync completed" });
  } catch (e) {
    next(e);
  }
}
