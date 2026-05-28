/** Allowed currencies for freight charges and forwarder bid amounts. */

export const FREIGHT_CHARGE_CURRENCIES = ["USD", "IDR"] as const;
export type FreightChargeCurrency = (typeof FREIGHT_CHARGE_CURRENCIES)[number];

export const DEFAULT_FREIGHT_CHARGE_CURRENCY: FreightChargeCurrency = "IDR";

export function normalizeFreightChargeCurrency(raw: unknown): FreightChargeCurrency | undefined {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim().toUpperCase();
  if (s === "USD" || s === "IDR") return s;
  return undefined;
}
