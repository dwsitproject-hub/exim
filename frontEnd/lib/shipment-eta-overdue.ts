import { parseEtaDate } from "@/lib/shipment-performance-on-time";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Calendar days ETA is before today when not delivered (for "(Overdue N days)" copy). */
export function getShipmentEtaOverdueDays(
  currentStatus: string | null | undefined,
  eta: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  const s = (currentStatus ?? "").toUpperCase();
  if (s === "DELIVERED") return null;
  const etaDay = parseEtaDate(eta);
  if (!etaDay) return null;
  const today = startOfLocalDay(now);
  const etaStart = startOfLocalDay(etaDay);
  const diffDays = Math.round((today.getTime() - etaStart.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return null;
  return diffDays;
}
