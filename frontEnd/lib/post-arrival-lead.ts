/** Warn threshold (business days ATA → delivered) for Post-Arrival Lead Time dashboard panels. */
export function postArrivalLeadWarnThresholdDays(loadType: string): number {
  const u = loadType.trim().toUpperCase();
  if (u === "AIR" || u === "BULK") return 2;
  return 5;
}

export const POST_ARRIVAL_LOAD_TYPE_ORDER = ["AIR", "BULK", "FCL", "LCL"] as const;

export function formatPostArrivalLoadType(loadType: string): string {
  const u = loadType.trim().toUpperCase();
  if (u === "AIR") return "Air";
  if (u === "BULK") return "Bulk";
  if (u === "LCL" || u === "FCL") return u;
  return loadType;
}

export function comparePostArrivalLoadTypes(a: string, b: string): number {
  const ia = POST_ARRIVAL_LOAD_TYPE_ORDER.indexOf(a as (typeof POST_ARRIVAL_LOAD_TYPE_ORDER)[number]);
  const ib = POST_ARRIVAL_LOAD_TYPE_ORDER.indexOf(b as (typeof POST_ARRIVAL_LOAD_TYPE_ORDER)[number]);
  const ai = ia === -1 ? 99 : ia;
  const bi = ib === -1 ? 99 : ib;
  if (ai !== bi) return ai - bi;
  return a.localeCompare(b);
}
