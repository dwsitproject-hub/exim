/**
 * Default date range for shipment analytics filters: Jan 1 → today (year to date).
 * Uses the local calendar (inclusive on both ends).
 */
export function getShipmentAnalyticsDefaultDateRange(
  referenceDate: Date = new Date()
): { from: string; to: string } {
  const to = new Date(referenceDate);
  to.setHours(0, 0, 0, 0);
  const from = new Date(to.getFullYear(), 0, 1);
  return { from: toYmd(from), to: toYmd(to) };
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
