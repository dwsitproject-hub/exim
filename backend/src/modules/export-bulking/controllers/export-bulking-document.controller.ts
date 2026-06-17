import type { Request, Response, NextFunction } from "express";
import { unlink } from "fs/promises";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { isExportBulkingUploadDocumentType } from "../constants/export-bulking-document-types.js";
import { ExportBulkingDocumentService } from "../services/export-bulking-document.service.js";
import { ExportBulkingRepository } from "../repositories/export-bulking.repository.js";
import { ExportBulkingDocumentRepository } from "../repositories/export-bulking-document.repository.js";

const shipmentRepo = new ExportBulkingRepository();
const docRepo = new ExportBulkingDocumentRepository();
const service = new ExportBulkingDocumentService(shipmentRepo, docRepo);

type MulterFile = { path?: string; originalname: string; mimetype?: string };

function actorFromRequest(req: Request): string {
  const name = req.user?.name?.trim();
  if (name) return name;
  const email = req.user?.email?.trim();
  if (email) return email;
  return "Unknown user";
}

export async function listDocuments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await service.list(req.params.id as string);
    sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
}

export async function uploadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  const shipmentId = req.params.id as string;
  const body = req.body as Record<string, unknown>;
  const documentType = typeof body.document_type === "string" ? body.document_type.trim() : "";

  if (!isExportBulkingUploadDocumentType(documentType)) {
    const orphan = (req as Request & { file?: MulterFile }).file?.path;
    if (orphan) await unlink(orphan).catch(() => {});
    sendError(res, "Invalid or missing document_type", { statusCode: 400 });
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
      documentType,
      tempPath,
      file.originalname || "file",
      file.mimetype,
      actorFromRequest(req),
    );
    sendSuccess(res, item, { message: "Document uploaded successfully", statusCode: 201 });
  } catch (e) {
    next(e);
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}

export async function downloadDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { stream, fileName, mimeType } = await service.getFileStream(
      req.params.id as string,
      req.params.documentId as string,
    );
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    if (mimeType) res.setHeader("Content-Type", mimeType);
    stream.pipe(res);
  } catch (e) {
    next(e);
  }
}

export async function deleteDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await service.remove(req.params.id as string, req.params.documentId as string);
    sendSuccess(res, { id: req.params.documentId }, { message: "Document deleted successfully" });
  } catch (e) {
    next(e);
  }
}
