/**
 * Shipment documents: upload to local storage, list, download, delete.
 */

import { stat } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../../../middlewares/errorHandler.js";
import { LocalStorageAdapter } from "../../../shared/storage/local-storage.adapter.js";
import { shipmentDocumentRequiresIntakeId } from "../constants/shipment-document-types.js";
import { PoIntakeRepository } from "../../po-intake/repositories/po-intake.repository.js";
import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { ShipmentDocumentRepository } from "../repositories/shipment-document.repository.js";
import { ShipmentPoMappingRepository } from "../repositories/shipment-po-mapping.repository.js";
import {
  buildFilingPathContext,
  buildShipmentDocumentDirectoryPrefix,
} from "../utils/shipment-document-storage-path.js";

function safeFileName(name: string): string {
  const n = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  return n || "file";
}

export interface ShipmentDocumentListItem {
  id: string;
  shipment_id: string;
  document_type: string;
  status: string | null;
  intake_id: string | null;
  po_number: string | null;
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
  status: string | null;
  intake_id?: string | null;
  po_number?: string | null;
  original_file_name: string;
  mime_type: string | null;
  size_bytes: string;
  uploaded_by: string;
  uploaded_at: Date;
}): ShipmentDocumentListItem {
  return {
    id: row.id,
    shipment_id: row.shipment_id,
    document_type: row.document_type,
    status: row.status,
    intake_id: row.intake_id ?? null,
    po_number: row.po_number ?? null,
    original_file_name: row.original_file_name,
    mime_type: row.mime_type,
    size_bytes: parseInt(row.size_bytes, 10) || 0,
    uploaded_by: row.uploaded_by,
    uploaded_at: row.uploaded_at.toISOString(),
  };
}

export class ShipmentDocumentService {
  private readonly storage = new LocalStorageAdapter();

  constructor(
    private readonly shipmentRepo: ShipmentRepository,
    private readonly docRepo: ShipmentDocumentRepository,
    private readonly mappingRepo: ShipmentPoMappingRepository,
    private readonly poIntakeRepo: PoIntakeRepository
  ) {}

  async list(shipmentId: string): Promise<ShipmentDocumentListItem[]> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    const rows = await this.docRepo.findByShipmentId(shipmentId);
    return rows.map(toListItem);
  }

  async upload(
    shipmentId: string,
    documentType: string,
    status: string | null,
    intakeId: string | null,
    tempFilePath: string,
    originalName: string,
    mimeType: string | undefined,
    uploadedBy: string
  ): Promise<ShipmentDocumentListItem> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    if (shipment.current_status === "DELIVERED") {
      throw new AppError("Cannot upload documents when shipment status is DELIVERED", 409);
    }

    let resolvedIntakeId: string | null = intakeId;
    if (shipmentDocumentRequiresIntakeId(documentType)) {
      if (!intakeId) {
        throw new AppError("intake_id is required for PO", 400);
      }
      const coupled = await this.mappingRepo.isCoupled(shipmentId, intakeId);
      if (!coupled) {
        throw new AppError("intake_id must be a purchase order currently linked to this shipment", 400);
      }
    } else {
      resolvedIntakeId = null;
    }

    const intakeRow =
      resolvedIntakeId != null ? await this.poIntakeRepo.findById(resolvedIntakeId) : null;
    if (resolvedIntakeId && !intakeRow) {
      throw new AppError("Linked purchase order intake not found", 404);
    }

    // PO rows store intake_id; other types do not. Filing path uses all active linked POs
    // (coupled_at ASC): same supplier → one folder with combined PO numbers.
    const linked = await this.mappingRepo.findActiveByShipmentId(shipmentId);
    const filingCtx = buildFilingPathContext(shipment, intakeRow, linked);
    const directoryPrefix = buildShipmentDocumentDirectoryPrefix(shipment, filingCtx);

    const id = uuidv4();
    const fileName = safeFileName(originalName || "file");
    const st = await stat(tempFilePath);
    const { storageKey } = await this.storage.uploadFromPath(tempFilePath, {
      documentId: shipmentId,
      versionId: id,
      fileName,
      mimeType,
      directoryPrefix,
    });

    const row = await this.docRepo.insert({
      id,
      shipmentId,
      documentType,
      status,
      intakeId: resolvedIntakeId,
      originalFileName: originalName || fileName,
      storageKey,
      mimeType: mimeType ?? null,
      sizeBytes: st.size,
      uploadedBy,
    });

    return toListItem(row);
  }

  async getFileStream(shipmentId: string, documentId: string) {
    const shipment = await this.shipmentRepo.findById(shipmentId);
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
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    if (shipment.current_status === "DELIVERED") {
      throw new AppError("Cannot delete documents when shipment status is DELIVERED", 409);
    }
    const row = await this.docRepo.findByIdAndShipment(documentId, shipmentId);
    if (!row) throw new AppError("Document not found", 404);
    await this.storage.delete(row.storage_key);
    await this.docRepo.deleteById(documentId);
  }
}
