/**
 * Shipment document metadata (files on local storage via storage_key).
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";

export interface ShipmentDocumentRow {
  id: string;
  shipment_id: string;
  document_type: string;
  status: string | null;
  intake_id: string | null;
  po_number: string | null;
  original_file_name: string;
  storage_key: string;
  mime_type: string | null;
  size_bytes: string;
  uploaded_by: string;
  uploaded_at: Date;
}

export interface InsertShipmentDocumentInput {
  id: string;
  shipmentId: string;
  documentType: string;
  status: string | null;
  intakeId: string | null;
  originalFileName: string;
  storageKey: string;
  mimeType: string | null;
  sizeBytes: number;
  uploadedBy: string;
}

export class ShipmentDocumentRepository {
  private get pool(): Pool {
    return getPool();
  }

  async insert(input: InsertShipmentDocumentInput): Promise<ShipmentDocumentRow> {
    const result = await this.pool.query<ShipmentDocumentRow>(
      `INSERT INTO shipment_documents
        (id, shipment_id, document_type, status, intake_id, original_file_name, storage_key, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, shipment_id, document_type, status, intake_id, original_file_name, storage_key, mime_type, size_bytes, uploaded_by, uploaded_at`,
      [
        input.id,
        input.shipmentId,
        input.documentType,
        input.status,
        input.intakeId,
        input.originalFileName,
        input.storageKey,
        input.mimeType,
        input.sizeBytes,
        input.uploadedBy,
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error("ShipmentDocumentRepository.insert: no row returned");
    return this.attachPoNumber(row);
  }

  private async attachPoNumber(row: ShipmentDocumentRow): Promise<ShipmentDocumentRow> {
    if (!row.intake_id) return { ...row, po_number: null };
    const r = await this.pool.query<{ po_number: string }>(
      `SELECT po_number FROM Import_purchase_order WHERE id = $1`,
      [row.intake_id]
    );
    return { ...row, po_number: r.rows[0]?.po_number ?? null };
  }

  async existsByShipmentIdAndDocumentType(shipmentId: string, documentType: string): Promise<boolean> {
    const result = await this.pool.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM shipment_documents WHERE shipment_id = $1 AND document_type = $2
       ) AS ok`,
      [shipmentId, documentType]
    );
    return result.rows[0]?.ok === true;
  }

  async findByShipmentId(shipmentId: string): Promise<ShipmentDocumentRow[]> {
    const result = await this.pool.query<ShipmentDocumentRow>(
      `SELECT d.id, d.shipment_id, d.document_type, d.status, d.intake_id, i.po_number,
              d.original_file_name, d.storage_key, d.mime_type, d.size_bytes, d.uploaded_by, d.uploaded_at
       FROM shipment_documents d
       LEFT JOIN Import_purchase_order i ON i.id = d.intake_id
       WHERE d.shipment_id = $1
       ORDER BY d.uploaded_at DESC`,
      [shipmentId]
    );
    return result.rows;
  }

  async findByIdAndShipment(documentId: string, shipmentId: string): Promise<ShipmentDocumentRow | null> {
    const result = await this.pool.query<ShipmentDocumentRow>(
      `SELECT d.id, d.shipment_id, d.document_type, d.status, d.intake_id, i.po_number,
              d.original_file_name, d.storage_key, d.mime_type, d.size_bytes, d.uploaded_by, d.uploaded_at
       FROM shipment_documents d
       LEFT JOIN Import_purchase_order i ON i.id = d.intake_id
       WHERE d.id = $1 AND d.shipment_id = $2`,
      [documentId, shipmentId]
    );
    return result.rows[0] ?? null;
  }

  async deleteById(documentId: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM shipment_documents WHERE id = $1`, [documentId]);
    return (result.rowCount ?? 0) > 0;
  }
}
