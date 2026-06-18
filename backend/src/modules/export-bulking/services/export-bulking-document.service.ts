import { stat } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../../../middlewares/errorHandler.js";
import { LocalStorageAdapter } from "../../../shared/storage/local-storage.adapter.js";
import { isExportBulkingUploadDocumentType } from "../constants/export-bulking-document-types.js";
import { ExportBulkingRepository } from "../repositories/export-bulking.repository.js";
import { ExportBulkingDocumentRepository } from "../repositories/export-bulking-document.repository.js";
import { buildExportBulkingDocumentDirectoryPrefix } from "../utils/export-bulking-document-storage-path.js";

function safeFileName(name: string): string {
  const n = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return n || "file";
}

export interface ExportBulkingDocumentListItem {
  id: string;
  shipment_id: string;
  document_type: string;
  original_file_name: string;
  mime_type: string | null;
  size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
}

function toListItem(row: {
  id: string;
  shipment_id: string;
  document_type: string;
  original_file_name: string;
  mime_type: string | null;
  size_bytes: string;
  uploaded_by: string;
  uploaded_at: Date;
}): ExportBulkingDocumentListItem {
  return {
    id: row.id,
    shipment_id: row.shipment_id,
    document_type: row.document_type,
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    size_bytes: parseInt(row.size_bytes, 10) || 0,
    uploaded_by: row.uploaded_by,
    uploaded_at: row.uploaded_at.toISOString(),
  };
}

export class ExportBulkingDocumentService {
  private readonly storage = new LocalStorageAdapter();

  constructor(
    private readonly shipmentRepo: ExportBulkingRepository,
    private readonly docRepo: ExportBulkingDocumentRepository,
  ) {}

  async list(shipmentId: string): Promise<ExportBulkingDocumentListItem[]> {
    const shipment = await this.shipmentRepo.getById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    const rows = await this.docRepo.findByShipmentId(shipmentId);
    return rows.map(toListItem);
  }

  async upload(
    shipmentId: string,
    documentType: string,
    tempFilePath: string,
    originalName: string,
    mimeType: string | undefined,
    uploadedBy: string,
  ): Promise<ExportBulkingDocumentListItem> {
    if (!isExportBulkingUploadDocumentType(documentType)) {
      throw new AppError("Invalid document type", 400);
    }

    const shipment = await this.shipmentRepo.getById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);

    const directoryPrefix = buildExportBulkingDocumentDirectoryPrefix({
      shipment_no: shipment.shipment_no,
      created_at: new Date(shipment.created_at),
      eta: shipment.eta,
      document_type: documentType,
    });

    const id = uuidv4();
    const fileName = safeFileName(originalName || "file");
    const st = await stat(tempFilePath);
    let storageKey: string | undefined;
    try {
      ({ storageKey } = await this.storage.uploadFromPath(tempFilePath, {
        documentId: shipmentId,
        versionId: id,
        fileName,
        mimeType,
        directoryPrefix,
      }));

      const row = await this.docRepo.insert({
        id,
        shipmentId,
        documentType,
        originalFileName: originalName || fileName,
        storageKey,
        mimeType: mimeType ?? null,
        sizeBytes: st.size,
        uploadedBy,
      });

      return toListItem(row);
    } catch (e) {
      if (storageKey) await this.storage.delete(storageKey).catch(() => {});
      throw e;
    }
  }

  async getFileStream(shipmentId: string, documentId: string) {
    const shipment = await this.shipmentRepo.getById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    const row = await this.docRepo.findByIdAndShipment(documentId, shipmentId);
    if (!row) throw new AppError("Document not found", 404);
    const result = await this.storage.download(row.storage_key);
    if (!result) throw new AppError("File not found on storage", 404);
    return {
      stream: result.stream,
      fileName: row.original_file_name,
      mimeType: row.mime_type ?? result.mimeType,
    };
  }

  async remove(shipmentId: string, documentId: string): Promise<void> {
    const shipment = await this.shipmentRepo.getById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    const row = await this.docRepo.findByIdAndShipment(documentId, shipmentId);
    if (!row) throw new AppError("Document not found", 404);
    const deleted = await this.docRepo.deleteById(documentId);
    if (!deleted) throw new AppError("Document not found", 404);
    await this.storage.delete(row.storage_key).catch(() => {});
  }
}
