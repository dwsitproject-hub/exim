/**
 * Persist Syncera poll runs and per-PO integration events for operator visibility.
 */

import { getPool } from "../../db/index.js";

export type SynceraPollRunStatus = "RUNNING" | "SUCCESS" | "FAILED";

export type SynceraIntegrationOutcome =
  | "ingested"
  | "updated"
  | "unchanged"
  | "skipped_invalid"
  | "skipped_conflict"
  | "skipped_locked_amendment"
  | "skipped_unknown_pt"
  | "skipped_non_id_country"
  | "failed";

export interface SynceraPollRunRow {
  id: string;
  started_at: Date;
  finished_at: Date | null;
  status: SynceraPollRunStatus;
  date_from: string;
  date_to: string;
  api_line_count: number;
  mapped_po_count: number;
  ingested: number;
  updated: number;
  unchanged: number;
  skipped_invalid: number;
  skipped_conflict: number;
  skipped_locked_amendment: number;
  skipped_unknown_pt: number;
  skipped_non_id_country: number;
  failed: number;
  error_message: string | null;
}

export interface SynceraIntegrationEventRow {
  id: string;
  run_id: string;
  created_at: Date;
  outcome: SynceraIntegrationOutcome;
  po_number: string | null;
  pt_code: string | null;
  external_id: string | null;
  intake_id: string | null;
  message: string | null;
}

export interface BeginPollRunInput {
  dateFrom: string;
  dateTo: string;
  apiLineCount: number;
  mappedPoCount: number;
}

export interface FinishPollRunInput {
  runId: string;
  status: SynceraPollRunStatus;
  metrics: {
    ingested: number;
    updated: number;
    unchanged: number;
    skippedInvalid: number;
    skippedConflict: number;
    skippedLockedAmendment: number;
    skippedUnknownPt: number;
    skippedNonIdCountry: number;
    failed: number;
  };
  errorMessage?: string | null;
}

export interface LogIntegrationEventInput {
  runId: string;
  outcome: SynceraIntegrationOutcome;
  poNumber?: string | null;
  ptCode?: string | null;
  externalId?: string | null;
  intakeId?: string | null;
  message?: string | null;
}

export class SynceraIntegrationAuditRepository {
  async beginPollRun(input: BeginPollRunInput): Promise<string> {
    const pool = getPool();
    const result = await pool.query<{ id: string }>(
      `INSERT INTO syncera_po_poll_runs
         (date_from, date_to, api_line_count, mapped_po_count, status)
       VALUES ($1, $2, $3, $4, 'RUNNING')
       RETURNING id`,
      [input.dateFrom, input.dateTo, input.apiLineCount, input.mappedPoCount]
    );
    return result.rows[0]!.id;
  }

  async finishPollRun(input: FinishPollRunInput): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE syncera_po_poll_runs SET
         finished_at = NOW(),
         status = $2,
         ingested = $3,
         updated = $4,
         unchanged = $5,
         skipped_invalid = $6,
         skipped_conflict = $7,
         skipped_locked_amendment = $8,
         skipped_unknown_pt = $9,
         skipped_non_id_country = $10,
         failed = $11,
         error_message = $12
       WHERE id = $1::uuid`,
      [
        input.runId,
        input.status,
        input.metrics.ingested,
        input.metrics.updated,
        input.metrics.unchanged,
        input.metrics.skippedInvalid,
        input.metrics.skippedConflict,
        input.metrics.skippedLockedAmendment,
        input.metrics.skippedUnknownPt,
        input.metrics.skippedNonIdCountry,
        input.metrics.failed,
        input.errorMessage ?? null,
      ]
    );
  }

  async logEvent(input: LogIntegrationEventInput): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO syncera_po_integration_events
         (run_id, outcome, po_number, pt_code, external_id, intake_id, message)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7)`,
      [
        input.runId,
        input.outcome,
        input.poNumber ?? null,
        input.ptCode ?? null,
        input.externalId ?? null,
        input.intakeId ?? null,
        input.message ?? null,
      ]
    );
  }

  async listPollRuns(limit = 30): Promise<SynceraPollRunRow[]> {
    const pool = getPool();
    const safeLimit = Math.min(100, Math.max(1, limit));
    const result = await pool.query<SynceraPollRunRow>(
      `SELECT id, started_at, finished_at, status, date_from, date_to, api_line_count, mapped_po_count,
              ingested, updated, unchanged, skipped_invalid, skipped_conflict, skipped_locked_amendment,
              skipped_unknown_pt, skipped_non_id_country, failed, error_message
       FROM syncera_po_poll_runs
       ORDER BY started_at DESC
       LIMIT $1`,
      [safeLimit]
    );
    return result.rows;
  }

  async listEventsForRun(runId: string, limit = 500): Promise<SynceraIntegrationEventRow[]> {
    const pool = getPool();
    const safeLimit = Math.min(2000, Math.max(1, limit));
    const result = await pool.query<SynceraIntegrationEventRow>(
      `SELECT id, run_id, created_at, outcome, po_number, pt_code, external_id, intake_id, message
       FROM syncera_po_integration_events
       WHERE run_id = $1::uuid
       ORDER BY created_at ASC, po_number ASC NULLS LAST
       LIMIT $2`,
      [runId, safeLimit]
    );
    return result.rows;
  }

  async listRecentEvents(limit = 100, outcome?: SynceraIntegrationOutcome): Promise<SynceraIntegrationEventRow[]> {
    const pool = getPool();
    const safeLimit = Math.min(500, Math.max(1, limit));
    if (outcome) {
      const result = await pool.query<SynceraIntegrationEventRow>(
        `SELECT id, run_id, created_at, outcome, po_number, pt_code, external_id, intake_id, message
         FROM syncera_po_integration_events
         WHERE outcome = $2
         ORDER BY created_at DESC
         LIMIT $1`,
        [safeLimit, outcome]
      );
      return result.rows;
    }
    const result = await pool.query<SynceraIntegrationEventRow>(
      `SELECT id, run_id, created_at, outcome, po_number, pt_code, external_id, intake_id, message
       FROM syncera_po_integration_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit]
    );
    return result.rows;
  }
}
