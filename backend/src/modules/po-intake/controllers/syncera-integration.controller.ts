/**
 * Syncera PO polling integration audit (poll runs + per-PO events).
 */

import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/response.js";
import {
  SynceraIntegrationAuditRepository,
  type SynceraIntegrationOutcome,
} from "../../../integration/saaS/syncera-integration-audit.repository.js";

const auditRepo = new SynceraIntegrationAuditRepository();

const OUTCOME_FILTER = new Set<string>([
  "ingested",
  "updated",
  "unchanged",
  "skipped_invalid",
  "skipped_conflict",
  "skipped_locked_amendment",
  "failed",
]);

function parseLimit(raw: unknown, fallback: number, max: number): number {
  const n = typeof raw === "string" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
}

export async function listSynceraPollRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const limit = parseLimit(req.query.limit, 30, 100);
    const runs = await auditRepo.listPollRuns(limit);
    sendSuccess(res, runs);
  } catch (e) {
    next(e);
  }
}

export async function listSynceraIntegrationEvents(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const runId = typeof req.query.run_id === "string" ? req.query.run_id.trim() : "";
    const outcomeRaw = typeof req.query.outcome === "string" ? req.query.outcome.trim() : "";
    const outcome = OUTCOME_FILTER.has(outcomeRaw) ? (outcomeRaw as SynceraIntegrationOutcome) : undefined;

    if (runId) {
      const limit = parseLimit(req.query.limit, 500, 2000);
      const events = await auditRepo.listEventsForRun(runId, limit);
      sendSuccess(res, events);
      return;
    }

    const limit = parseLimit(req.query.limit, 100, 500);
    const events = await auditRepo.listRecentEvents(limit, outcome);
    sendSuccess(res, events);
  } catch (e) {
    next(e);
  }
}
