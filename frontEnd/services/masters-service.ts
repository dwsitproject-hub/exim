/**
 * Master-data API (DHM-backed company + exchange_rate) — /masters.
 */

import { apiGet, apiPost } from "./api-client";
import type { ApiResponse } from "@/types/api";
import type {
  CompanyMasterSummary,
  CreateCompanyInput,
  CreateCompanyResult,
  DhmSyncHealth,
  ExchangeRateLookupResult,
  MasterCatalog,
  PtPlantTreeNode,
} from "@/types/masters";

export async function searchCompanies(
  query: string,
  accessToken: string | null,
  limit = 20
): Promise<ApiResponse<CompanyMasterSummary[]>> {
  const q = new URLSearchParams();
  if (query.trim()) q.set("query", query.trim());
  q.set("limit", String(limit));
  return apiGet<CompanyMasterSummary[]>(`masters/companies?${q.toString()}`, accessToken);
}

export async function getMasterCatalog(accessToken: string | null): Promise<ApiResponse<MasterCatalog>> {
  return apiGet<MasterCatalog>("masters/catalog", accessToken);
}

export async function getPtPlantTree(accessToken: string | null): Promise<ApiResponse<PtPlantTreeNode[]>> {
  return apiGet<PtPlantTreeNode[]>("masters/pt-plant-tree", accessToken);
}

export async function createCompany(
  body: CreateCompanyInput,
  accessToken: string | null
): Promise<ApiResponse<CreateCompanyResult>> {
  return apiPost<CreateCompanyResult>("masters/companies", body, accessToken);
}

export async function getLatestExchangeRate(
  params: { from: string; to: string; date?: string },
  accessToken: string | null
): Promise<ApiResponse<ExchangeRateLookupResult>> {
  const q = new URLSearchParams({ from: params.from, to: params.to });
  if (params.date) q.set("date", params.date);
  return apiGet<ExchangeRateLookupResult>(`masters/exchange-rates/latest?${q.toString()}`, accessToken);
}

export async function getDhmSyncHealth(accessToken: string | null): Promise<ApiResponse<DhmSyncHealth[]>> {
  return apiGet<DhmSyncHealth[]>("masters/dhm/health", accessToken);
}

export async function triggerDhmSync(
  entityType: "company" | "site" | "plant" | "exchange_rate" | undefined,
  accessToken: string | null
): Promise<ApiResponse<{ triggered: boolean; entityType: string }>> {
  return apiPost<{ triggered: boolean; entityType: string }>("masters/dhm/sync", { entityType }, accessToken);
}
