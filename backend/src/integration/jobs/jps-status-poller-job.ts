/**
 * Poll JPS partner status for open Shipping Instructions (≥5 minutes).
 */

import { getJpsSyncService, isJpsConfigReady } from "../jps/index.js";
import { logger } from "../../utils/logger.js";

let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tick(): Promise<void> {
  if (!isJpsConfigReady()) return;
  if (running) return;
  running = true;
  try {
    const result = await getJpsSyncService().runStatusPollCycle();
    if (result.polled > 0) {
      logger.info("JPS status poll cycle complete", { polled: result.polled });
    }
  } catch (err) {
    logger.warn("JPS status poll cycle failed", { error: String(err) });
  } finally {
    running = false;
  }
}

export function startJpsStatusPollerJob(intervalMs: number): void {
  if (intervalId != null) {
    logger.warn("JPS status poller already started");
    return;
  }
  const ms = Math.max(5 * 60 * 1000, intervalMs);
  void tick();
  intervalId = setInterval(() => void tick(), ms);
  logger.info("JPS status poller started", { intervalMs: ms });
}

export function stopJpsStatusPollerJob(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
