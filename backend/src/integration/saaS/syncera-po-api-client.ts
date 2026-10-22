/**
 * Syncera GET /api/v1/po-import client (Asia/Jakarta date window).
 */

import type { IPoApiClient, PoImportFetchResult, SaasPoResponse, SynceraPoLine } from "./types.js";
import { SynceraAuthClient } from "./syncera-auth.js";
import { synceraDateWindow } from "./syncera-dates.js";
import { buildSynceraMasterSnapshot, mapSynceraLines } from "./syncera-mapper.js";
import { DhmSyncRepository } from "../dhm/dhm-sync.repository.js";
import { logger } from "../../utils/logger.js";

export interface SynceraPoApiClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  lookbackDays: number;
  company?: string;
  requestTimeoutMs: number;
}

export class SynceraPoApiClient implements IPoApiClient {
  private readonly auth: SynceraAuthClient;

  constructor(private readonly options: SynceraPoApiClientOptions) {
    this.auth = new SynceraAuthClient(
      options.baseUrl,
      options.clientId,
      options.clientSecret,
      options.requestTimeoutMs
    );
  }

  async fetchImportBatch(): Promise<PoImportFetchResult> {
    const token = await this.auth.getAccessToken();
    const { dateFrom, dateTo } = synceraDateWindow(this.options.lookbackDays);
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    const company = this.options.company?.trim();
    if (company) params.set("company", company);
    const url = `${this.options.baseUrl}/api/v1/po-import?${params.toString()}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(this.options.requestTimeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      logger.warn("Syncera po-import failed", { status: res.status });
      throw new Error(`Syncera po-import failed: HTTP ${res.status}`);
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error("Syncera po-import returned non-JSON");
    }
    const data = extractDataArray(body);
    const repo = new DhmSyncRepository();
    const [companies, plants] = await Promise.all([
      repo.listActiveCompaniesForMatch(),
      repo.listActivePlantsForMatch(),
    ]);
    const snapshot = buildSynceraMasterSnapshot(companies, plants);
    const { mapped, skipped } = await mapSynceraLines(data, snapshot);
    return {
      mapped,
      dateFrom,
      dateTo,
      rawLineCount: data.length,
      skippedAtMap: skipped,
    };
  }

  async fetchNewImportPos(): Promise<SaasPoResponse[]> {
    const batch = await this.fetchImportBatch();
    return batch.mapped;
  }
}

function extractDataArray(body: unknown): SynceraPoLine[] {
  if (Array.isArray(body)) return body as SynceraPoLine[];
  if (body && typeof body === "object" && "data" in body) {
    const data = (body as { data: unknown }).data;
    if (Array.isArray(data)) return data as SynceraPoLine[];
  }
  return [];
}
