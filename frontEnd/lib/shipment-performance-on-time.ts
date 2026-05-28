import type { OnTimeStatusDisplay } from "@/types/shipment-performance";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse ETA (ISO or YYYY-MM-DD) to a Date for calendar comparison. */
export function parseEtaDate(eta: string | Date | null | undefined): Date | null {
  if (eta == null) return null;
  if (eta instanceof Date) {
    return Number.isNaN(eta.getTime()) ? null : eta;
  }
  const s = String(eta).trim();
  if (!s) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]) - 1;
    const day = Number(ymd[3]);
    const d = new Date(y, m, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Compare ETA to "today" (local) for in-flight shipments; delivered rows read as On Time.
 * At Risk: ETA within the next 7 calendar days (inclusive) and not yet delivered.
 */
export function computeOnTimeStatus(
  currentStatus: string | null | undefined,
  eta: string | Date | null | undefined,
  now: Date = new Date()
): OnTimeStatusDisplay {
  const s = (currentStatus ?? "").toUpperCase();
  if (s === "DELIVERED") {
    return { label: "On Time", kind: "on_time" };
  }

  const etaDay = parseEtaDate(eta);
  if (!etaDay) {
    return { label: "—", kind: "muted" };
  }

  const today = startOfLocalDay(now);
  const etaStart = startOfLocalDay(etaDay);
  const diffDays = Math.round((etaStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: "Late", kind: "late" };
  }
  if (diffDays <= 7) {
    return { label: "At Risk", kind: "at_risk" };
  }
  return { label: "On Time", kind: "on_time" };
}
