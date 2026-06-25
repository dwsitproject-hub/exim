/**
 * Daily job: import shipment ETA H-2 / H-1 in-app notifications (Asia/Jakarta calendar).
 */

import { runShipmentEtaReminderCycle } from "../../modules/shipments/services/shipment-eta-reminder.service.js";
import { ETA_REMINDER_TIMEZONE } from "../../modules/shipments/utils/shipment-eta-reminder-messages.js";
import { logger } from "../../utils/logger.js";

const CHECK_INTERVAL_MS = 60_000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastRunJakartaDate: string | null = null;

function getJakartaParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ETA_REMINDER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
  };
}

export function jakartaDateKey(date = new Date()): string {
  const p = getJakartaParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** True when Jakarta local time is at or past the configured daily run time (once per calendar day). */
export function shouldRunEtaReminderNow(
  runHourJakarta: number,
  runMinuteJakarta: number,
  now = new Date(),
  lastRunDate: string | null = lastRunJakartaDate
): boolean {
  const hour = Math.min(23, Math.max(0, runHourJakarta));
  const minute = Math.min(59, Math.max(0, runMinuteJakarta));
  const p = getJakartaParts(now);
  const today = jakartaDateKey(now);
  if (lastRunDate === today) return false;
  const nowMinutes = p.hour * 60 + p.minute;
  const runMinutes = hour * 60 + minute;
  return nowMinutes >= runMinutes;
}

async function tick(runHourJakarta: number, runMinuteJakarta: number): Promise<void> {
  if (!shouldRunEtaReminderNow(runHourJakarta, runMinuteJakarta)) return;
  lastRunJakartaDate = jakartaDateKey();
  await runShipmentEtaReminderCycle();
}

export function startShipmentEtaReminderJob(runHourJakarta: number, runMinuteJakarta: number): void {
  if (intervalId != null) {
    logger.warn("Shipment ETA reminder job already started");
    return;
  }

  void tick(runHourJakarta, runMinuteJakarta);
  intervalId = setInterval(() => void tick(runHourJakarta, runMinuteJakarta), CHECK_INTERVAL_MS);

  logger.info("Shipment ETA reminder job started", {
    timezone: ETA_REMINDER_TIMEZONE,
    runHourJakarta,
    runMinuteJakarta,
    checkIntervalMs: CHECK_INTERVAL_MS,
  });
}

export function stopShipmentEtaReminderJob(): void {
  if (intervalId != null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  lastRunJakartaDate = null;
  logger.info("Shipment ETA reminder job stopped");
}

/** Reset last-run guard (tests only). */
export function resetShipmentEtaReminderJobState(): void {
  lastRunJakartaDate = null;
}

/** Exposed for manual / test invocation. */
export { runShipmentEtaReminderCycle };
