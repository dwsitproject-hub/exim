/**
 * In-memory cache for JPS GET /ports and GET /commodities.
 */

import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { JpsApiClient } from "./jps-api-client.js";
import type { JpsCommodity, JpsPort } from "./types.js";

const DEFAULT_TTL_MS = 15 * 60 * 1000;

type CacheEntry<T> = { fetchedAt: number; data: T };

let portsCache: CacheEntry<JpsPort[]> | null = null;
let commoditiesCache: CacheEntry<JpsCommodity[]> | null = null;

function ttlMs(): number {
  const raw = process.env.JPS_MASTER_CACHE_TTL_MS;
  if (!raw) return DEFAULT_TTL_MS;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? DEFAULT_TTL_MS : Math.max(60_000, n);
}

function isFresh(entry: CacheEntry<unknown> | null): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < ttlMs();
}

export async function getJpsPorts(options?: { forceRefresh?: boolean }): Promise<{
  data: JpsPort[];
  fetched_at: string;
  cached: boolean;
}> {
  if (!options?.forceRefresh && isFresh(portsCache) && portsCache) {
    return {
      data: portsCache.data,
      fetched_at: new Date(portsCache.fetchedAt).toISOString(),
      cached: true,
    };
  }
  const client = JpsApiClient.fromConfig();
  if (!client.isConfigured) {
    return { data: portsCache?.data ?? [], fetched_at: new Date().toISOString(), cached: false };
  }
  try {
    const data = await client.listPorts();
    portsCache = { fetchedAt: Date.now(), data };
    return {
      data,
      fetched_at: new Date(portsCache.fetchedAt).toISOString(),
      cached: false,
    };
  } catch (err) {
    logger.warn("JPS ports fetch failed; serving stale cache if any", { error: String(err) });
    if (portsCache) {
      return {
        data: portsCache.data,
        fetched_at: new Date(portsCache.fetchedAt).toISOString(),
        cached: true,
      };
    }
    throw err;
  }
}

export async function getJpsCommodities(options?: { forceRefresh?: boolean }): Promise<{
  data: JpsCommodity[];
  fetched_at: string;
  cached: boolean;
}> {
  if (!options?.forceRefresh && isFresh(commoditiesCache) && commoditiesCache) {
    return {
      data: commoditiesCache.data,
      fetched_at: new Date(commoditiesCache.fetchedAt).toISOString(),
      cached: true,
    };
  }
  const client = JpsApiClient.fromConfig();
  if (!client.isConfigured) {
    return {
      data: commoditiesCache?.data ?? [],
      fetched_at: new Date().toISOString(),
      cached: false,
    };
  }
  try {
    const data = await client.listCommodities();
    commoditiesCache = { fetchedAt: Date.now(), data };
    return {
      data,
      fetched_at: new Date(commoditiesCache.fetchedAt).toISOString(),
      cached: false,
    };
  } catch (err) {
    logger.warn("JPS commodities fetch failed; serving stale cache if any", {
      error: String(err),
    });
    if (commoditiesCache) {
      return {
        data: commoditiesCache.data,
        fetched_at: new Date(commoditiesCache.fetchedAt).toISOString(),
        cached: true,
      };
    }
    throw err;
  }
}

/** Warm cache on boot when JPS sync is enabled (best-effort). */
export function warmJpsMasterCache(): void {
  if (!config.jps.enabled) return;
  void getJpsPorts().catch((err) =>
    logger.warn("JPS ports cache warm failed", { error: String(err) })
  );
  void getJpsCommodities().catch((err) =>
    logger.warn("JPS commodities cache warm failed", { error: String(err) })
  );
}
