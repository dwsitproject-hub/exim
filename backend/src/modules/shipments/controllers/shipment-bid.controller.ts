/**
 * Shipment bid controllers: list, create, update, delete, upload quotation.
 */

import type { Request, Response, NextFunction } from "express";
import { unlink } from "fs/promises";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { validateCreateBidBody, validateUpdateBidBody } from "../validators/index.js";
import { ShipmentBidRepository } from "../repositories/shipment-bid.repository.js";
import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { LocalStorageAdapter } from "../../../shared/storage/local-storage.adapter.js";

const bidRepo = new ShipmentBidRepository();
const shipmentRepo = new ShipmentRepository();
const storage = new LocalStorageAdapter();

function quotationExpiresAtToYmd(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return null;
}

function toBidResponse(row: {
  id: string;
  shipment_id: string;
  forwarder_name: string;
  service_amount: number | null;
  service_amount_currency: string;
  duration: string | null;
  quotation_expires_at: Date | string | null;
  origin_port: string | null;
  destination_port: string | null;
  ship_via: string | null;
  quotation_file_name: string | null;
  quotation_storage_key: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: row.id,
    shipment_id: row.shipment_id,
    forwarder_name: row.forwarder_name,
    service_amount: row.service_amount,
    service_amount_currency: row.service_amount_currency,
    duration: row.duration,
    quotation_expires_at: quotationExpiresAtToYmd(row.quotation_expires_at),
    origin_port: row.origin_port,
    destination_port: row.destination_port,
    ship_via: row.ship_via,
    quotation_file_name: row.quotation_file_name,
    quotation_storage_key: row.quotation_storage_key,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function listBids(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  try {
    const shipment = await shipmentRepo.findById(shipmentId);
    if (!shipment) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    const rows = await bidRepo.findByShipmentId(shipmentId);
    const data = rows.map(toBidResponse);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

/** Latest bid snapshot per forwarder: same origin port country as the given shipment, quotation still valid. */
export async function listRecentForwarders(req: Request, res: Response, next: NextFunction): Promise<void> {
  const raw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 20;
  const limit = Number.isFinite(raw) ? raw : 20;
  const shipmentId = typeof req.query.shipment_id === "string" ? req.query.shipment_id.trim() : "";
  if (!shipmentId) {
    sendError(res, "shipment_id query parameter is required", { statusCode: 400 });
    return;
  }
  try {
    const shipment = await shipmentRepo.findById(shipmentId);
    if (!shipment) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    const qOrigin =
      typeof req.query.origin_port_country === "string" ? req.query.origin_port_country.trim() : "";
    const originFilter = qOrigin || (shipment.origin_port_country ?? "").trim();
    const rows = await bidRepo.findRecentForwarders(limit, originFilter, shipmentId);
    const data = rows.map((row) => ({
      forwarder_name: row.forwarder_name,
      shipment_id: row.shipment_id,
      duration: row.duration,
      quotation_expires_at: quotationExpiresAtToYmd(row.quotation_expires_at),
      service_amount: row.service_amount,
      service_amount_currency: row.service_amount_currency,
      origin_port: row.origin_port,
      destination_port: row.destination_port,
      origin_country: row.origin_country,
      destination_country: row.destination_country,
      ship_via: row.ship_via,
      updated_at: row.updated_at.toISOString(),
    }));
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function createBid(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const validation = validateCreateBidBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const shipment = await shipmentRepo.findById(shipmentId);
    if (!shipment) {
      sendError(res, "Shipment not found", { statusCode: 404 });
      return;
    }
    const dto = { ...validation.data };
    if ((dto.origin_port == null || dto.origin_port === "") && shipment.origin_port_name?.trim()) {
      dto.origin_port = shipment.origin_port_name.trim();
    }
    const row = await bidRepo.create(shipmentId, dto);
    sendSuccess(res, toBidResponse(row), { message: "Bid added successfully", statusCode: 201 });
  } catch (e) {
    next(e);
  }
}

export async function updateBid(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const bidId = req.params.bidId as string;
  const validation = validateUpdateBidBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const bid = await bidRepo.findById(bidId);
    if (!bid || bid.shipment_id !== shipmentId) {
      sendError(res, "Bid not found", { statusCode: 404 });
      return;
    }
    const updated = await bidRepo.update(bidId, validation.data);
    if (!updated) {
      sendError(res, "Failed to update bid", { statusCode: 500 });
      return;
    }
    sendSuccess(res, toBidResponse(updated), { message: "Bid updated successfully" });
  } catch (e) {
    next(e);
  }
}

export async function deleteBid(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const bidId = req.params.bidId as string;
  try {
    const bid = await bidRepo.findById(bidId);
    if (!bid || bid.shipment_id !== shipmentId) {
      sendError(res, "Bid not found", { statusCode: 404 });
      return;
    }
    if (bid.quotation_storage_key) {
      await storage.delete(bid.quotation_storage_key);
    }
    const deleted = await bidRepo.delete(bidId);
    if (!deleted) {
      sendError(res, "Failed to delete bid", { statusCode: 500 });
      return;
    }
    sendSuccess(res, { id: bidId }, { message: "Bid deleted successfully" });
  } catch (e) {
    next(e);
  }
}

type MulterFile = { path?: string; buffer?: Buffer; originalname: string; mimetype?: string };

export async function uploadQuotation(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const bidId = req.params.bidId as string;
  const file = (req as Request & { file?: MulterFile }).file;
  const tempPath = file?.path;
  if (!tempPath) {
    sendError(res, "File is required", { statusCode: 400 });
    return;
  }
  try {
    const bid = await bidRepo.findById(bidId);
    if (!bid || bid.shipment_id !== shipmentId) {
      sendError(res, "Bid not found", { statusCode: 404 });
      return;
    }
    if (bid.quotation_storage_key) {
      await storage.delete(bid.quotation_storage_key);
    }
    const fileName = file.originalname || "quotation";
    const result = await storage.uploadFromPath(tempPath, {
      documentId: shipmentId,
      versionId: bidId,
      fileName,
      mimeType: file.mimetype,
    });
    const updated = await bidRepo.update(bidId, {
      quotation_file_name: fileName,
      quotation_storage_key: result.storageKey,
    });
    if (!updated) {
      sendError(res, "Failed to update bid with quotation", { statusCode: 500 });
      return;
    }
    sendSuccess(res, toBidResponse(updated), { message: "Quotation uploaded successfully" });
  } catch (e) {
    next(e);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

export async function downloadQuotation(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const bidId = req.params.bidId as string;
  try {
    const bid = await bidRepo.findById(bidId);
    if (!bid || bid.shipment_id !== shipmentId || !bid.quotation_storage_key) {
      sendError(res, "Quotation not found", { statusCode: 404 });
      return;
    }
    const result = await storage.download(bid.quotation_storage_key);
    if (!result) {
      sendError(res, "File not found", { statusCode: 404 });
      return;
    }
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(bid.quotation_file_name || "quotation")}"`);
    if (result.mimeType) res.setHeader("Content-Type", result.mimeType);
    result.stream.pipe(res);
  } catch (e) {
    next(e);
  }
}
