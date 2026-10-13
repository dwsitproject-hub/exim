/**
 * PO polling service: every interval, fetch Syncera import POs, create or amend intake.
 */

import type { PoIntakeRepository } from "../../modules/po-intake/repositories/po-intake.repository.js";
import type { PoIntakeService } from "../../modules/po-intake/services/po-intake.service.js";
import type { ShipmentPoMappingRepository } from "../../modules/shipments/repositories/shipment-po-mapping.repository.js";
import type { IPoApiClient } from "./types.js";
import { logger } from "../../utils/logger.js";
import { upsertMappedPo, type UpsertKind } from "./syncera-po-upsert.js";
import {
  SynceraIntegrationAuditRepository,
  type SynceraIntegrationOutcome,
} from "./syncera-integration-audit.repository.js";
import { synceraDateWindow } from "./syncera-dates.js";

export interface PoPollingServiceOptions {
  intervalMs: number;
  poApiClient: IPoApiClient;
}

export interface PoPollingCycleMetrics {
  ingested: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  skippedInvalid: number;
  skippedConflict: number;
  skippedLockedAmendment: number;
  failed: number;
}

export interface PoPollingDeps {
  repo: PoIntakeRepository;
  service: PoIntakeService;
  mappingRepo: ShipmentPoMappingRepository;
  client: IPoApiClient;
  auditRepo?: SynceraIntegrationAuditRepository;
  /** Used to record poll window when the API call fails before a batch is returned. */
  lookbackDays?: number;
}

function upsertKindToOutcome(kind: UpsertKind): SynceraIntegrationOutcome {
  if (kind === "skippedConflict") return "skipped_conflict";
  if (kind === "skippedLockedAmendment") return "skipped_locked_amendment";
  return kind;
}

function ptCodeFromExternalId(externalId: string): string | undefined {
  const parts = externalId.split(":");
  if (parts.length >= 3 && parts[0] === "syncera") return parts[1];
  return undefined;
}

export async function runPoPollingCycle(deps: PoPollingDeps): Promise<PoPollingCycleMetrics> {
  const metrics: PoPollingCycleMetrics = {
    ingested: 0,
    updated: 0,
    unchanged: 0,
    duplicates: 0,
    skippedInvalid: 0,
    skippedConflict: 0,
    skippedLockedAmendment: 0,
    failed: 0,
  };

  const audit = deps.auditRepo;
  let runId: string | null = null;

  try {
    const batch = await deps.client.fetchImportBatch();
    const dateFrom = batch.dateFrom ?? "00000000";
    const dateTo = batch.dateTo ?? "00000000";

    if (audit) {
      runId = await audit.beginPollRun({
        dateFrom,
        dateTo,
        apiLineCount: batch.rawLineCount,
        mappedPoCount: batch.mapped.length,
      });
      for (const skip of batch.skippedAtMap) {
        metrics.skippedInvalid += 1;
        await audit.logEvent({
          runId,
          outcome: "skipped_invalid",
          poNumber: skip.po_number,
          ptCode: skip.pt_code,
          externalId: skip.external_id,
          message: skip.message,
        });
      }
    } else {
      metrics.skippedInvalid += batch.skippedAtMap.length;
    }

    for (const po of batch.mapped) {
      try {
        const result = await upsertMappedPo({
          repo: deps.repo,
          service: deps.service,
          mappingRepo: deps.mappingRepo,
          mapped: po,
        });
        if (result.kind === "ingested") metrics.ingested += 1;
        else if (result.kind === "updated") metrics.updated += 1;
        else if (result.kind === "unchanged") {
          metrics.unchanged += 1;
          metrics.duplicates += 1;
        } else if (result.kind === "skippedConflict") metrics.skippedConflict += 1;
        else if (result.kind === "skippedLockedAmendment") metrics.skippedLockedAmendment += 1;
        else metrics.failed += 1;

        if (audit && runId) {
          await audit.logEvent({
            runId,
            outcome: upsertKindToOutcome(result.kind),
            poNumber: po.po_number,
            ptCode: ptCodeFromExternalId(po.external_id),
            externalId: po.external_id,
            intakeId: result.intakeId,
            message: result.message,
          });
        }
      } catch (err) {
        metrics.failed += 1;
        const msg = String(err);
        logger.warn("PO upsert failed", { external_id: po.external_id, error: msg });
        if (audit && runId) {
          await audit.logEvent({
            runId,
            outcome: "failed",
            poNumber: po.po_number,
            ptCode: ptCodeFromExternalId(po.external_id),
            externalId: po.external_id,
            message: msg,
          });
        }
      }
    }

    if (audit && runId) {
      await audit.finishPollRun({
        runId,
        status: "SUCCESS",
        metrics: {
          ingested: metrics.ingested,
          updated: metrics.updated,
          unchanged: metrics.unchanged,
          skippedInvalid: metrics.skippedInvalid,
          skippedConflict: metrics.skippedConflict,
          skippedLockedAmendment: metrics.skippedLockedAmendment,
          failed: metrics.failed,
        },
      });
    }

    if (metrics.ingested > 0 || metrics.updated > 0 || metrics.failed > 0 || metrics.skippedInvalid > 0) {
      logger.info("PO polling cycle completed", { ...metrics, runId });
    }
  } catch (err) {
    const msg = String(err);
    logger.error("PO polling cycle failed", { error: msg });
    if (audit) {
      if (!runId) {
        const { dateFrom, dateTo } = synceraDateWindow(deps.lookbackDays ?? 14);
        runId = await audit.beginPollRun({
          dateFrom,
          dateTo,
          apiLineCount: 0,
          mappedPoCount: 0,
        });
      }
      await audit.finishPollRun({
        runId,
        status: "FAILED",
        metrics: {
          ingested: metrics.ingested,
          updated: metrics.updated,
          unchanged: metrics.unchanged,
          skippedInvalid: metrics.skippedInvalid,
          skippedConflict: metrics.skippedConflict,
          skippedLockedAmendment: metrics.skippedLockedAmendment,
          failed: metrics.failed,
        },
        errorMessage: msg,
      });
    }
  }

  return metrics;
}

let pollingIntervalId: ReturnType<typeof setInterval> | null = null;

export function startPoPolling(deps: PoPollingDeps, intervalMs: number): void {
  if (pollingIntervalId != null) {
    logger.warn("PO polling already started");
    return;
  }
  const run = () => {
    void runPoPollingCycle(deps);
  };
  run();
  pollingIntervalId = setInterval(run, intervalMs);
  logger.info("PO polling started", { intervalMs });
}

export function stopPoPolling(): void {
  if (pollingIntervalId != null) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
    logger.info("PO polling stopped");
  }
}
