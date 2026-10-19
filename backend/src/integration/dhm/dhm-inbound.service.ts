/**
 * Pattern A (master owner): EOS may create a `company` in DHM (internal legal entity / PT).
 * See §8/§9 of CLIENT_INTEGRATION.md.
 */

import type { Pool } from "pg";
import { getPool } from "../../db/index.js";
import { logger } from "../../utils/logger.js";
import { DhmApiError } from "./dhm-errors.js";
import type { DhmClient } from "./dhm-client.js";
import { buildCompanyInboundPayload, mapCompanyRecord } from "./dhm-mapper.js";
import { DhmSyncRepository, type DhmSyncStateRow } from "./dhm-sync.repository.js";
import type { DhmInboundResult, DhmCompanyData } from "./types.js";

export interface CreateCompanyInput {
  name: string;
  short_name?: string | null;
  company_code_sap?: string | null;
  country?: string | null;
  is_active?: boolean;
}

export interface CreateCompanyOutcome {
  /** "created" (new golden record), "updated"/"unchanged" (matched existing), "pending_review", "duplicate". */
  status: DhmInboundResult["status"];
  code?: string;
  name?: string;
  pendingReview: boolean;
  inboundId?: string;
  message?: string;
}

export class DhmInboundService {
  constructor(
    private readonly client: DhmClient,
    private readonly repo: DhmSyncRepository = new DhmSyncRepository(),
    private readonly pool: Pool = getPool()
  ) {}

  /**
   * Create a company in DHM and upsert it into company_master so it is immediately usable.
   */
  async createCompany(
    input: CreateCompanyInput,
    opts: { idempotencyKey: string; submittedByUserId?: string | null }
  ): Promise<CreateCompanyOutcome> {
    const payload = buildCompanyInboundPayload(input);

    let result: DhmInboundResult<DhmCompanyData>;
    try {
      result = await this.client.inboundCreate<DhmCompanyData>("company", payload, opts.idempotencyKey);
    } catch (err) {
      if (err instanceof DhmApiError && err.isDuplicate && err.body?.record) {
        // Same master, same data — treat as success and surface the existing record.
        const record = err.body.record as { code?: string; id?: string };
        await this.logSubmission(opts, payload, "duplicate", err.body.inboundId as string | undefined, err.message);
        return { status: "duplicate", code: record.code, pendingReview: false, message: err.message };
      }
      await this.logSubmission(opts, payload, "error", undefined, err instanceof Error ? err.message : String(err));
      throw err;
    }

    if (result.record?.id && result.record.data) {
      const row = mapCompanyRecord({
        id: result.record.id,
        version: result.record.version,
        isDeleted: result.record.isDeleted,
        data: result.record.data as unknown as Record<string, unknown>,
        updatedAt: result.record.updatedAt ?? new Date().toISOString(),
      });
      await this.repo.upsertCompany(row);
    }

    const pendingReview = result.status === "pending_review";
    await this.logSubmission(
      opts,
      payload,
      result.status,
      result.inboundId,
      result.resultMessage,
      result.code
    );

    logger.info("DHM company inbound submitted", {
      status: result.status,
      code: result.code,
      inboundId: result.inboundId,
      httpStatus: result.httpStatus,
    });

    return {
      status: result.status,
      code: result.code,
      name: input.name,
      pendingReview,
      inboundId: result.inboundId,
      message: result.resultMessage,
    };
  }

  async getSyncHealth(): Promise<DhmSyncStateRow[]> {
    const slugs = ["company", "site", "plant", "exchange_rate"] as const;
    const rows = await Promise.all(slugs.map((slug) => this.repo.getSyncState(slug)));
    return rows.filter((s): s is DhmSyncStateRow => s !== null);
  }

  private async logSubmission(
    opts: { idempotencyKey: string; submittedByUserId?: string | null },
    payload: Record<string, unknown>,
    status: string,
    dhmInboundId: string | undefined,
    resultMessage: string | undefined,
    resultCode?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO dhm_inbound_submissions (
         entity_type, dhm_inbound_id, idempotency_key, request_payload, status, result_code,
         result_message, submitted_by_user_id
       ) VALUES ('company', $1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (entity_type, idempotency_key) DO UPDATE SET
         dhm_inbound_id = EXCLUDED.dhm_inbound_id,
         status = EXCLUDED.status,
         result_code = EXCLUDED.result_code,
         result_message = EXCLUDED.result_message,
         updated_at = NOW()`,
      [
        dhmInboundId ?? null,
        opts.idempotencyKey,
        JSON.stringify(payload),
        status,
        resultCode ?? null,
        resultMessage ?? null,
        opts.submittedByUserId ?? null,
      ]
    );
  }
}
