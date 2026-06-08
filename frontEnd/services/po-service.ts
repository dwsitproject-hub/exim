/**
 * PO API — services layer. All PO (imported PO intake) API calls go through here.
 */

import { apiGet, apiPost, apiPatch, apiRequest } from "./api-client";
import type {
  PoListItem,
  PoDetail,
  ListPoQuery,
  PoListFilterOptions,
  CreateTestPoPayload,
  UpdatePoPayload,
  PoImportCsvResult,
  PoImportHistoryItem,
  PoIntakeActivityItem,
  ParsedPoResult,
  PoPdfAiRequestItem,
} from "@/types/po";
import type { ApiResponse } from "@/types/api";
import { config } from "@/lib/config";
import { COOKIE_AUTH_SENTINEL } from "@/lib/constants";

function buildQueryString(query: ListPoQuery): string {
  const params = new URLSearchParams();
  if (query.page != null) params.set("page", String(query.page));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.search) params.set("search", query.search);
  if (query.intake_status) params.set("intake_status", query.intake_status);
  if (query.po_number) params.set("po_number", query.po_number);
  if (query.unclaimed_only) params.set("unclaimed_only", "true");
  if (query.has_linked_shipment === true) params.set("has_linked_shipment", "true");
  if (query.has_linked_shipment === false) params.set("has_linked_shipment", "false");
  if (query.detected_older_than_days != null) params.set("detected_older_than_days", String(query.detected_older_than_days));
  query.po_numbers?.forEach((v) => params.append("po_number_exact", v));
  query.external_ids?.forEach((v) => params.append("external_id", v));
  query.pts?.forEach((v) => params.append("pt", v));
  query.plants?.forEach((v) => params.append("plant", v));
  query.supplier_names?.forEach((v) => params.append("supplier_name", v));
  query.delivery_locations?.forEach((v) => params.append("delivery_location", v));
  query.incoterm_locations?.forEach((v) => params.append("incoterm_location", v));
  query.kawasan_berikats?.forEach((v) => params.append("kawasan_berikat", v));
  query.currencies?.forEach((v) => params.append("currency", v));
  query.intake_statuses?.forEach((v) => params.append("intake_statuses", v));
  query.taken_by_user_ids?.forEach((v) => params.append("taken_by_user_id", v));
  query.taken_by_names?.forEach((v) => params.append("taken_by_name", v));
  query.taken_at_dates?.forEach((v) => params.append("taken_at_date", v));
  query.created_at_dates?.forEach((v) => params.append("created_at_date", v));
  query.updated_at_dates?.forEach((v) => params.append("updated_at_date", v));
  if (query.sort_by) params.set("sort_by", query.sort_by);
  if (query.sort_dir) params.set("sort_dir", query.sort_dir);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function listPo(
  query: ListPoQuery,
  accessToken: string | null
): Promise<ApiResponse<PoListItem[]>> {
  const path = `po${buildQueryString(query)}`;
  return apiGet<PoListItem[]>(path, accessToken);
}

export async function getPoListFilterOptions(
  accessToken: string | null
): Promise<ApiResponse<PoListFilterOptions>> {
  return apiGet<PoListFilterOptions>("po/list-filter-options", accessToken);
}

export async function getPoDetail(
  id: string,
  accessToken: string | null
): Promise<ApiResponse<PoDetail>> {
  return apiGet<PoDetail>(`po/${id}`, accessToken);
}

export async function getPoActivityLog(
  id: string,
  accessToken: string | null
): Promise<ApiResponse<{ items: PoIntakeActivityItem[] }>> {
  return apiGet<{ items: PoIntakeActivityItem[] }>(`po/${id}/activity-log`, accessToken);
}

export async function updatePo(
  id: string,
  body: UpdatePoPayload,
  accessToken: string | null
): Promise<ApiResponse<PoDetail>> {
  return apiPatch<PoDetail>(`po/${id}`, body, accessToken);
}

export async function takeOwnership(
  id: string,
  accessToken: string | null
): Promise<ApiResponse<PoDetail>> {
  return apiPost<PoDetail>(`po/${id}/take`, {}, accessToken);
}

export async function createShipmentFromPo(
  id: string,
  accessToken: string | null
): Promise<ApiResponse<{ shipment_id: string; shipment_number: string; shipment?: unknown }>> {
  return apiPost(`po/${id}/create-shipment`, {}, accessToken);
}

export async function couplePoToShipment(
  id: string,
  shipmentId: string,
  accessToken: string | null
): Promise<ApiResponse<unknown>> {
  return apiPost(`po/${id}/couple-to-shipment`, { shipment_id: shipmentId }, accessToken);
}

/** Temporary: create a test PO for E2E testing (integration not yet available). POST /po/test-create */
export async function createTestPo(
  payload: CreateTestPoPayload,
  accessToken: string | null
): Promise<ApiResponse<{ id: string; external_id: string; po_number: string; intake_status: string; created_at: string }>> {
  return apiPost("po/test-create", payload, accessToken);
}

/** GET /po/lookup-by-po-number — resolve intake id from PO number (for grouping on a shipment). */
export async function lookupPoByPoNumber(
  poNumber: string,
  accessToken: string | null
): Promise<ApiResponse<{ id: string }>> {
  const q = new URLSearchParams({ po_number: poNumber.trim() });
  return apiGet<{ id: string }>(`po/lookup-by-po-number?${q.toString()}`, accessToken);
}

export async function importPoCsv(
  file: File,
  accessToken: string | null
): Promise<ApiResponse<PoImportCsvResult>> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<PoImportCsvResult>("po/import/csv", {
    method: "POST",
    body: form,
    accessToken,
  });
}

/** POST /po/import/parse-pdf — OCR a PO PDF and return pre-fill data. Does NOT create a PO. */
export async function parsePoPdf(
  file: File,
  accessToken: string | null,
  options?: { requestAi?: boolean }
): Promise<ApiResponse<ParsedPoResult>> {
  const form = new FormData();
  form.append("file", file);
  if (options?.requestAi) {
    form.append("request_ai", "true");
  }
  return apiRequest<ParsedPoResult>("po/import/parse-pdf", {
    method: "POST",
    body: form,
    accessToken,
  });
}

export async function listPoImportHistory(
  accessToken: string | null,
  limit = 20
): Promise<ApiResponse<PoImportHistoryItem[]>> {
  const q = new URLSearchParams({ limit: String(limit) });
  return apiGet<PoImportHistoryItem[]>(`po/import/history?${q.toString()}`, accessToken);
}

/** GET /po/admin/pdf-ai-requests — admin audit log for PO PDF AI rescans. */
export async function listPoPdfAiRequests(
  accessToken: string | null,
  options?: { page?: number; limit?: number }
): Promise<ApiResponse<PoPdfAiRequestItem[]>> {
  const q = new URLSearchParams();
  if (options?.page != null) q.set("page", String(options.page));
  if (options?.limit != null) q.set("limit", String(options.limit));
  const qs = q.toString();
  return apiGet<PoPdfAiRequestItem[]>(
    `po/admin/pdf-ai-requests${qs ? `?${qs}` : ""}`,
    accessToken
  );
}

export async function downloadPoImportTemplate(accessToken: string | null): Promise<Blob> {
  const url = `${config.apiBaseUrl}/po/import/template-csv`;
  const headers: Record<string, string> = {};
  if (accessToken && accessToken !== COOKIE_AUTH_SENTINEL) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(url, { method: "GET", headers, credentials: "include" });
  if (!res.ok) {
    throw new Error("Failed to download template");
  }
  return res.blob();
}

