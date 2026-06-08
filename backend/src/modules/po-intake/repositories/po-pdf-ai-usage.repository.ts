/**
 * Tracks Claude API usage per uploaded PDF (content hash + user) to prevent repeat calls.
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";

export type PoPdfAiCallType = "extract";

export class PoPdfAiUsageRepository {
  private pool(): Pool {
    return getPool();
  }

  /** Returns true if this user already consumed their one AI call for this file. */
  async hasUsedAi(contentHash: string, userId: string): Promise<boolean> {
    const result = await this.pool().query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM po_pdf_ai_usage
         WHERE content_hash = $1 AND user_id = $2
       ) AS exists`,
      [contentHash, userId]
    );
    return Boolean(result.rows[0]?.exists);
  }

  /** Records successful AI usage (quota consumed — one success per file per user). */
  async tryRecordUsage(
    contentHash: string,
    userId: string,
    callType: PoPdfAiCallType
  ): Promise<boolean> {
    const result = await this.pool().query(
      `INSERT INTO po_pdf_ai_usage (content_hash, user_id, call_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (content_hash, user_id) DO NOTHING
       RETURNING id`,
      [contentHash, userId, callType]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
