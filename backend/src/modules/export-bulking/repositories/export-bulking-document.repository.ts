import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";

export interface ExportBulkingDocumentRow {
  id: string;
  shipment_id: string;
  document_type: string;
  original_file_name: string;
  storage_key: string;
  mime_type: string | null;
  size_bytes: string;
  uploaded_by: string;
  uploaded_at: Date;
}

export interface InsertExportBulkingDocumentInput {
  id: string;
  shipmentId: string;
  documentType: string;
  originalFileName: string;
  storageKey: string;
  mimeType: string | null;
  sizeBytes: number;
  uploadedBy: string;
}

export class ExportBulkingDocumentRepository {
  private get pool(): Pool {
    return getPool();
  }

  async insert(input: InsertExportBulkingDocumentInput): Promise<ExportBulkingDocumentRow> {
    const result = await this.pool.query<ExportBulkingDocumentRow>(
      `INSERT INTO export_bulking_documents
        (id, shipment_id, document_type, original_file_name, storage_key, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, shipment_id, document_type, original_file_name, storage_key, mime_type, size_bytes, uploaded_by, uploaded_at`,
      [
        input.id,
        input.shipmentId,
        input.documentType,
        input.originalFileName,
        input.storageKey,
        input.mimeType,
        input.sizeBytes,
        input.uploadedBy,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("ExportBulkingDocumentRepository.insert: no row returned");
    return row;
  }

  async findByShipmentId(shipmentId: string): Promise<ExportBulkingDocumentRow[]> {
    const result = await this.pool.query<ExportBulkingDocumentRow>(
      `SELECT id, shipment_id, document_type, original_file_name, storage_key, mime_type, size_bytes, uploaded_by, uploaded_at
       FROM export_bulking_documents
       WHERE shipment_id = $1
       ORDER BY uploaded_at DESC`,
      [shipmentId],
    );
    return result.rows;
  }

  async findByIdAndShipment(documentId: string, shipmentId: string): Promise<ExportBulkingDocumentRow | null> {
    const result = await this.pool.query<ExportBulkingDocumentRow>(
      `SELECT id, shipment_id, document_type, original_file_name, storage_key, mime_type, size_bytes, uploaded_by, uploaded_at
       FROM export_bulking_documents
       WHERE id = $1 AND shipment_id = $2`,
      [documentId, shipmentId],
    );
    return result.rows[0] ?? null;
  }

  async deleteById(documentId: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM export_bulking_documents WHERE id = $1`, [documentId]);
    return (result.rowCount ?? 0) > 0;
  }
}
