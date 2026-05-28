/**
 * Default PPN / PPH rates when a shipment row has NULL `ppn_percentage` / `pph_percentage`.
 * Per-shipment overrides are stored on `shipments`; env is the fallback only.
 */

function parsePct(envKey: string, defaultVal: number): number {
  const raw = process.env[envKey];
  if (raw == null || raw === "") return defaultVal;
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return defaultVal;
  return n;
}

/** PPN: % of (total PO amount + BM). Env: PPN_PERCENTAGE */
export const PPN_PERCENTAGE = parsePct("PPN_PERCENTAGE", 11);

/** PPH: % of (total PO amount + BM). Env: PPH_PERCENTAGE */
export const PPH_PERCENTAGE = parsePct("PPH_PERCENTAGE", 2.5);
