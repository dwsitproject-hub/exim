/**
 * Asia/Jakarta calendar dates for Syncera GET /po-import (yyyymmdd).
 */

export function jakartaCalendarYyyymmdd(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now).replace(/-/g, "");
}

export function yyyymmddAddDays(yyyymmdd: string, deltaDays: number): string {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6));
  const d = Number(yyyymmdd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export function synceraDateWindow(
  lookbackDays: number,
  now = new Date()
): { dateFrom: string; dateTo: string } {
  const dateTo = jakartaCalendarYyyymmdd(now);
  const days = Math.min(90, Math.max(1, lookbackDays));
  return { dateFrom: yyyymmddAddDays(dateTo, -days), dateTo };
}
