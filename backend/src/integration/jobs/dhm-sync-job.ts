/**
 * Periodic DHM reconciliation sync (company + exchange_rate). Webhooks are the fast path; this is
 * the safety net recommended by CLIENT_INTEGRATION.md §13 ("prefer both").
 */

import type { DhmSyncService } from "../dhm/dhm-sync.service.js";
import { logger } from "../../utils/logger.js";

let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(syncService: DhmSyncService): Promise<void> {
  if (running) return;
  running = true;
  try {
    await syncService.syncAll();
  } catch (err) {
    logger.error("DHM sync job tick failed", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    running = false;
  }
}

export function startDhmSyncJob(syncService: DhmSyncService, intervalMs: number): void {
  if (intervalId != null) {
    logger.warn("DHM sync job already started");
    return;
  }
  void tick(syncService);
  intervalId = setInterval(() => void tick(syncService), intervalMs);
  logger.info("DHM sync job started", { intervalMs });
}

export function stopDhmSyncJob(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  logger.info("DHM sync job stopped");
}
