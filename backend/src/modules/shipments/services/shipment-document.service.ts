/**
 * Shipment documents: upload to local storage, list, download, delete.
 * PIB DRAFT → local-only `_drafts/` root + OCR soft-compare.
 * PIB FINAL → Synology/filing path (no OCR required).
 */

import { stat } from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { AppError } from "../../../middlewares/errorHandler.js";
import {
  DRAFT_STORAGE_KEY_PREFIX,
  LocalStorageAdapter,
} from "../../../shared/storage/local-storage.adapter.js";
import { parsePibPdf } from "../../../shared/pib-pdf-parser.js";
import { logger } from "../../../utils/logger.js";
import { shipmentDocumentRequiresIntakeId } from "../constants/shipment-document-types.js";
import { PoIntakeRepository } from "../../po-intake/repositories/po-intake.repository.js";
import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { ShipmentDocumentRepository } from "../repositories/shipment-document.repository.js";
import { ShipmentPoMappingRepository } from "../repositories/shipment-po-mapping.repository.js";
import {
  buildFilingPathContext,
  buildShipmentDocumentDirectoryPrefix,
} from "../utils/shipment-document-storage-path.js";
import { decodeMultipartFileName, repairMojibakeFileName } from "../../../shared/upload-filename.js";
import {
  comparePibOcrToShipment,
  type PibOcrWarning,
} from "./pib-ocr-verify.service.js";
import type { ParsedPibFields } from "../../../shared/pib-pdf-parser.js";

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
  ocr_extracted: ParsedPibFields | null;
  ocr_warnings: PibOcrWarning[] | null;
  ocr_compared_at: string | null;
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
  ocr_extracted?: unknown | null;
  ocr_warnings?: unknown | null;
  ocr_compared_at?: Date | null;
}): ShipmentDocumentListItem {
  return {
    id: row.id,
    shipment_id: row.shipment_id,
    document_type: row.document_type,
    status: row.status,
    intake_id: row.intake_id ?? null,
    po_number: row.po_number ?? null,
    original_file_name: repairMojibakeFileName(row.original_file_name),
    mime_type: row.mime_type,
    size_bytes: parseInt(row.size_bytes, 10) || 0,
    uploaded_by: row.uploaded_by,
    uploaded_at: row.uploaded_at.toISOString(),
    ocr_extracted: (row.ocr_extracted as ParsedPibFields | null) ?? null,
    ocr_warnings: (row.ocr_warnings as PibOcrWarning[] | null) ?? null,
    ocr_compared_at: row.ocr_compared_at ? row.ocr_compared_at.toISOString() : null,
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

    if (documentType !== "PO") {
      if (!(shipment.pib_type ?? "").trim()) {
        throw new AppError("Set PIB type on the shipment before uploading documents", 400, [
          { field: "pib_type", message: "PIB type is required before uploading documents" },
        ]);
      }
      const hasPo = await this.docRepo.existsByShipmentIdAndDocumentType(shipmentId, "PO");
      if (!hasPo) {
        throw new AppError("Upload PO before uploading other documents", 409, [
          { field: "document_type", message: "PO document must be uploaded first" },
        ]);
      }
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

    const linked = await this.mappingRepo.findActiveByShipmentId(shipmentId);
    const isPibDraft = documentType === "PIB_BC" && status === "DRAFT";
    const isPibFinal = documentType === "PIB_BC" && status === "FINAL";

    let directoryPrefix: string;
    if (isPibDraft) {
      directoryPrefix = `${DRAFT_STORAGE_KEY_PREFIX}${shipmentId}/PIB_BC_DRAFT`;
    } else {
      const filingCtx = buildFilingPathContext(shipment, intakeRow, linked);
      directoryPrefix = buildShipmentDocumentDirectoryPrefix(shipment, filingCtx, documentType);
    }

    const id = uuidv4();
    const displayName = decodeMultipartFileName(originalName || "file");
    const fileName = safeFileName(displayName);
    const st = await stat(tempFilePath);

    // Run OCR on draft before moving the temp file into storage (uploadFromPath unlinks source).
    let ocrExtracted: ParsedPibFields | null = null;
    let ocrWarnings: PibOcrWarning[] | null = null;
    let ocrComparedAt: Date | null = null;
    if (isPibDraft) {
      try {
        ocrExtracted = await parsePibPdf(tempFilePath);
        const invoiceNos = linked.map((l) => l.invoice_no).filter((x): x is string => !!x?.trim());
        const currencyRates = linked
          .map((l) => (l.currency_rate != null ? Number(l.currency_rate) : null))
          .filter((n): n is number => n != null && Number.isFinite(n));
        ocrWarnings = comparePibOcrToShipment(ocrExtracted, {
          shipment,
          invoiceNos,
          currencyRates,
        });
        ocrComparedAt = new Date();
      } catch (err) {
        logger.error("PIB draft OCR failed; storing file with parse warning", { err, shipmentId });
        ocrWarnings = [
          {
            field: "parse",
            label: "Parse",
            eos_value: null,
            ocr_value: null,
            severity: "missing_ocr",
            message: `OCR failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        ];
        ocrComparedAt = new Date();
      }
    }

    const { storageKey } = await this.storage.uploadFromPath(tempFilePath, {
      documentId: shipmentId,
      versionId: id,
      fileName,
      mimeType,
      directoryPrefix,
    });

    if (isPibFinal && storageKey.startsWith(DRAFT_STORAGE_KEY_PREFIX)) {
      throw new AppError("PIB FINAL must be stored on the filing path", 500);
    }

    const row = await this.docRepo.insert({
      id,
      shipmentId,
      documentType,
      status,
      intakeId: resolvedIntakeId,
      originalFileName: displayName,
      storageKey,
      mimeType: mimeType ?? null,
      sizeBytes: st.size,
      uploadedBy,
      ocrExtracted,
      ocrWarnings,
      ocrComparedAt,
    });

    return toListItem(row);
  }

  async recheckPibDraft(shipmentId: string, documentId: string): Promise<ShipmentDocumentListItem> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    const row = await this.docRepo.findByIdAndShipment(documentId, shipmentId);
    if (!row) throw new AppError("Document not found", 404);
    if (row.document_type !== "PIB_BC" || row.status !== "DRAFT") {
      throw new AppError("Recheck is only available for PIB_BC DRAFT documents", 400);
    }
    const abs = this.storage.resolveAbsolutePath(row.storage_key);
    const extracted = await parsePibPdf(abs);
    const linked = await this.mappingRepo.findActiveByShipmentId(shipmentId);
    const invoiceNos = linked.map((l) => l.invoice_no).filter((x): x is string => !!x?.trim());
    const currencyRates = linked
      .map((l) => (l.currency_rate != null ? Number(l.currency_rate) : null))
      .filter((n): n is number => n != null && Number.isFinite(n));
    const warnings = comparePibOcrToShipment(extracted, { shipment, invoiceNos, currencyRates });
    const updated = await this.docRepo.updateOcrResult(documentId, extracted, warnings, new Date());
    if (!updated) throw new AppError("Failed to update OCR result", 500);
    return toListItem(updated);
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
      fileName: repairMojibakeFileName(row.original_file_name),
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
