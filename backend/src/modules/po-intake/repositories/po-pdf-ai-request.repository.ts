/**
 * Audit log for PO PDF AI (Rescan with AI) requests.
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import type { ItemCompleteness } from "../../../shared/po-pdf-completeness.js";

export type PoPdfAiRequestStatus = "success" | "failed";
export type PoPdfConfidence = "high" | "medium" | "low";

export interface PoPdfAiRequestInsert {
  contentHash: string;
  userId: string;
  originalFilename?: string | null;
  poNumber?: string | null;
  templateCode?: string | null;
  status: PoPdfAiRequestStatus;
  confidenceBefore?: PoPdfConfidence | null;
  confidenceAfter?: PoPdfConfidence | null;
  itemsBefore: number;
  itemsAfter: number;
  itemCompleteness?: ItemCompleteness | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  errorMessage?: string | null;
}

export interface PoPdfAiRequestRow {
  id: string;
  content_hash: string;
  user_id: string;
  user_name: string;
  user_email: string;
  original_filename: string | null;
  po_number: string | null;
  template_code: string | null;
  status: PoPdfAiRequestStatus;
  confidence_before: PoPdfConfidence | null;
  confidence_after: PoPdfConfidence | null;
  items_before: number;
  items_after: number;
  item_completeness: ItemCompleteness | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  error_message: string | null;
  created_at: Date;
}

export class PoPdfAiRequestRepository {
  private pool(): Pool {
    return getPool();
  }

  async insert(input: PoPdfAiRequestInsert): Promise<void> {
    await this.pool().query(
      `INSERT INTO po_pdf_ai_requests (
         content_hash, user_id, original_filename, po_number, template_code,
         status, confidence_before, confidence_after, items_before, items_after,
         item_completeness, model, input_tokens, output_tokens, error_message
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        input.contentHash,
        input.userId,
        input.originalFilename ?? null,
        input.poNumber ?? null,
        input.templateCode ?? null,
        input.status,
        input.confidenceBefore ?? null,
        input.confidenceAfter ?? null,
        input.itemsBefore,
        input.itemsAfter,
        input.itemCompleteness ?? null,
        input.model ?? null,
        input.inputTokens ?? null,
        input.outputTokens ?? null,
        input.errorMessage ?? null,
      ]
    );
  }

  async listForAdmin(options: {
    page?: number;
    limit?: number;
  }): Promise<{ rows: PoPdfAiRequestRow[]; total: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const countResult = await this.pool().query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM po_pdf_ai_requests`
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const result = await this.pool().query<PoPdfAiRequestRow>(
      `SELECT r.id, r.content_hash, r.user_id,
              u.name AS user_name, u.email AS user_email,
              r.original_filename, r.po_number, r.template_code,
              r.status, r.confidence_before, r.confidence_after,
              r.items_before, r.items_after, r.item_completeness,
              r.model, r.input_tokens, r.output_tokens, r.error_message,
              r.created_at
       FROM po_pdf_ai_requests r
       JOIN users u ON u.id = r.user_id
       ORDER BY r.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return { rows: result.rows, total };
  }
}
