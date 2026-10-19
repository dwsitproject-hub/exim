/**
 * Dashboard reporting: IDR per 1 USD from DHM exchange_rate master (USD → IDR).
 * Falls back to DASHBOARD_IDR_PER_USD when no rate exists for the as-of date.
 */

import { config } from "../config/index.js";
import { DhmSyncRepository } from "../integration/dhm/dhm-sync.repository.js";

export type ResolvedIdrPerUsd = {
  idr_per_usd: number;
  /** YYYY-MM-DD from master, or null when env fallback was used. */
  exchange_rate_date: string | null;
  source: "master" | "fallback";
};

export async function resolveIdrPerUsd(
  asOfDate: string,
  repo: DhmSyncRepository = new DhmSyncRepository()
): Promise<ResolvedIdrPerUsd> {
  const row = await repo.findLatestExchangeRate("USD", "IDR", asOfDate);
  if (row != null && Number.isFinite(row.rate) && row.rate > 0) {
    return {
      idr_per_usd: row.rate,
      exchange_rate_date: row.rate_date,
      source: "master",
    };
  }
  return {
    idr_per_usd: config.dashboard.idrPerUsd,
    exchange_rate_date: null,
    source: "fallback",
  };
}
