/**
 * Local-calendar YYYY-MM-DD range for dashboard filters and shipment list deep links.
 * Inclusive: `days` calendar days ending on `referenceDate` (default: today).
 * Example: days=7 → today and the previous 6 days (7 days total).
 */
export function getRecentDateRange(
  days: number,
  referenceDate: Date = new Date()
): { from: string; to: string } {
  const end = new Date(referenceDate);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { from: toYmd(start), to: toYmd(end) };
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
