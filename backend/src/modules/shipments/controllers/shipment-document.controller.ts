/**
 * Shipment documents: list, upload (multipart), download stream, delete.
 */

import type { Request, Response, NextFunction } from "express";
import { unlink } from "fs/promises";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { validateShipmentDocumentUpload } from "../validators/shipment-document.validator.js";
import { ShipmentDocumentService } from "../services/shipment-document.service.js";
import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { ShipmentDocumentRepository } from "../repositories/shipment-document.repository.js";
import { ShipmentPoMappingRepository } from "../repositories/shipment-po-mapping.repository.js";
import { PoIntakeRepository } from "../../po-intake/repositories/po-intake.repository.js";

const shipmentRepo = new ShipmentRepository();
const docRepo = new ShipmentDocumentRepository();
const mappingRepo = new ShipmentPoMappingRepository();
const poIntakeRepo = new PoIntakeRepository();
const service = new ShipmentDocumentService(shipmentRepo, docRepo, mappingRepo, poIntakeRepo);

type MulterFile = { path?: string; buffer?: Buffer; originalname: string; mimetype?: string };

function actorFromRequest(req: Request): string {
  const name = req.user?.name?.trim();
  if (name) return name;
  const email = req.user?.email?.trim();
  if (email) return email;
  return "Unknown user";
}

export async function listDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  try {
    const data = await service.list(shipmentId);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function uploadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const validation = validateShipmentDocumentUpload(req);
  if (!validation.ok) {
    const orphan = (req as Request & { file?: MulterFile }).file?.path;
    if (orphan) await unlink(orphan).catch(() => {});
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  const file = (req as Request & { file?: MulterFile }).file;
  const tempPath = file?.path;
  if (!tempPath) {
    sendError(res, "File is required (field name: file)", { statusCode: 400 });
    return;
  }
  try {
    const item = await service.upload(
      shipmentId,
      validation.data.document_type,
      validation.data.status,
      validation.data.intake_id,
      tempPath,
      file.originalname || "file",
      file.mimetype,
      actorFromRequest(req)
    );
    sendSuccess(res, item, { message: "Document uploaded successfully", statusCode: 201 });
  } catch (e) {
    next(e);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

export async function downloadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const documentId = req.params.documentId as string;
  try {
    const { stream, fileName, mimeType } = await service.getFileStream(shipmentId, documentId);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    if (mimeType) res.setHeader("Content-Type", mimeType);
    stream.pipe(res);
  } catch (e) {
    next(e);
  }
}

export async function deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const documentId = req.params.documentId as string;
  try {
    await service.remove(shipmentId, documentId);
    sendSuccess(res, { id: documentId }, { message: "Document deleted successfully" });
  } catch (e) {
    next(e);
  }
}
