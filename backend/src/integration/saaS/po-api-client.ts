/**
 * PO API client factory: Syncera when configured, else mock samples or no-op.
 */

import type { IPoApiClient, PoImportFetchResult, SaasPoResponse } from "./types.js";
import { mockPoSamples } from "./mock-po-samples.js";
import { SynceraPoApiClient } from "./syncera-po-api-client.js";
import { fingerprintMappedPo } from "./syncera-mapper.js";
import { logger } from "../../utils/logger.js";

export class MockPoApiClient implements IPoApiClient {
  private mappedSamples(): SaasPoResponse[] {
    if (process.env.MOCK_PO_SAMPLES === "true" || process.env.MOCK_PO_SAMPLES === "1") {
      return mockPoSamples.map((po) => ({
        ...po,
        fingerprint: fingerprintMappedPo({
          po_number: po.po_number,
          plant: po.plant,
          pt: po.pt,
          supplier_name: po.supplier_name,
          delivery_location: po.delivery_location,
          incoterm_location: po.incoterm_location,
          kawasan_berikat: po.kawasan_berikat,
          currency: po.currency,
          items: po.items ?? [],
        }),
      }));
    }
    return [];
  }

  async fetchImportBatch(): Promise<PoImportFetchResult> {
    const mapped = this.mappedSamples();
    return { mapped, rawLineCount: 0, skippedAtMap: [] };
  }

  async fetchNewImportPos(): Promise<SaasPoResponse[]> {
    return this.mappedSamples();
  }
}

export interface CreatePoApiClientOptions {
  saasApiBaseUrl: string;
  clientId: string;
  clientSecret: string;
  lookbackDays: number;
  company?: string;
  requestTimeoutMs: number;
}

export function isSynceraConfigured(options: {
  saasApiBaseUrl: string;
  clientId: string;
  clientSecret: string;
}): boolean {
  return Boolean(options.saasApiBaseUrl.trim() && options.clientId.trim() && options.clientSecret.trim());
}

export function isMockPoSamplesEnabled(): boolean {
  return process.env.MOCK_PO_SAMPLES === "true" || process.env.MOCK_PO_SAMPLES === "1";
}

export function createPoApiClient(options: CreatePoApiClientOptions): IPoApiClient {
  if (isSynceraConfigured(options)) {
    return new SynceraPoApiClient({
      baseUrl: options.saasApiBaseUrl.replace(/\/+$/, ""),
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      lookbackDays: options.lookbackDays,
      company: options.company,
      requestTimeoutMs: options.requestTimeoutMs,
    });
  }
  if (isMockPoSamplesEnabled()) {
    return new MockPoApiClient();
  }
  logger.warn("PO API client is no-op: Syncera URL/credentials unset and MOCK_PO_SAMPLES is off");
  return new MockPoApiClient();
}
