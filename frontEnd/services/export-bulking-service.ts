import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "./api-client";
import type { ApiResponse } from "@/types/api";
import type {
  ExportBulkingListItem,
  ExportBulkingShipmentDetail,
  ExportBulkingFilterOptions,
  ListExportBulkingQuery,
  CargoLine,
  CargoLineUpsertPayload,
  ShippingInstruction,
  Invoice,
  PackingList,
  StatusEvent,
} from "@/types/export-bulking";
import { COOKIE_AUTH_SENTINEL } from "@/lib/constants";

const BASE = "export/bulking/shipments";

function tok(accessToken: string): string {
  return accessToken === COOKIE_AUTH_SENTINEL ? COOKIE_AUTH_SENTINEL : accessToken;
}

function buildQueryString(q: ListExportBulkingQuery): string {
  const params = new URLSearchParams();
  if (q.page != null) params.set("page", String(q.page));
  if (q.limit != null) params.set("limit", String(q.limit));
  if (q.search) params.set("search", q.search);
  q.statuses?.forEach((s) => params.append("statuses", s));
  if (q.sort_by) params.set("sort_by", q.sort_by);
  if (q.sort_dir) params.set("sort_dir", q.sort_dir);
  const str = params.toString();
  return str ? `?${str}` : "";
}

export function listExportBulkingShipments(
  query: ListExportBulkingQuery,
  accessToken: string,
): Promise<ApiResponse<ExportBulkingListItem[]>> {
  return apiGet<ExportBulkingListItem[]>(`${BASE}${buildQueryString(query)}`, tok(accessToken));
}

export function getExportBulkingFilterOptions(
  accessToken: string,
): Promise<ApiResponse<ExportBulkingFilterOptions>> {
  return apiGet<ExportBulkingFilterOptions>(`${BASE}/filter-options`, tok(accessToken));
}

export function getExportBulkingShipment(
  id: string,
  accessToken: string,
): Promise<ApiResponse<ExportBulkingShipmentDetail>> {
  return apiGet<ExportBulkingShipmentDetail>(`${BASE}/${id}/full`, tok(accessToken));
}

export function getExportBulkingShipmentBasic(
  id: string,
  accessToken: string,
): Promise<ApiResponse<ExportBulkingListItem>> {
  return apiGet<ExportBulkingListItem>(`${BASE}/${id}`, tok(accessToken));
}

export function createExportBulkingShipment(
  body: Record<string, unknown>,
  accessToken: string,
): Promise<ApiResponse<ExportBulkingListItem>> {
  return apiPost<ExportBulkingListItem>(BASE, body, tok(accessToken));
}

export function updateExportBulkingShipment(
  id: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<ApiResponse<ExportBulkingListItem>> {
  return apiPatch<ExportBulkingListItem>(`${BASE}/${id}`, body, tok(accessToken));
}

export function updateExportBulkingStatus(
  id: string,
  newStatus: string,
  accessToken: string,
): Promise<ApiResponse<unknown>> {
  return apiPatch<unknown>(`${BASE}/${id}/status`, { status: newStatus }, tok(accessToken));
}

export function deleteExportBulkingShipment(
  id: string,
  accessToken: string,
): Promise<ApiResponse<unknown>> {
  return apiDelete<unknown>(`${BASE}/${id}`, tok(accessToken));
}

export function getStatusEvents(
  id: string,
  accessToken: string,
): Promise<ApiResponse<StatusEvent[]>> {
  return apiGet<StatusEvent[]>(`${BASE}/${id}/status-events`, tok(accessToken));
}

/* ───── cargo lines ───── */

export function listCargoLines(
  shipmentId: string,
  accessToken: string,
): Promise<ApiResponse<CargoLine[]>> {
  return apiGet<CargoLine[]>(`${BASE}/${shipmentId}/cargos`, tok(accessToken));
}

export function upsertCargoLines(
  shipmentId: string,
  lines: CargoLineUpsertPayload[],
  accessToken: string,
): Promise<ApiResponse<CargoLine[]>> {
  return apiPut<CargoLine[]>(`${BASE}/${shipmentId}/cargos`, { lines }, tok(accessToken));
}

export function deleteCargoLine(
  shipmentId: string,
  cargoId: string,
  accessToken: string,
): Promise<ApiResponse<unknown>> {
  return apiDelete<unknown>(`${BASE}/${shipmentId}/cargos/${cargoId}`, tok(accessToken));
}

/* ───── shipping instructions ───── */

export function listShippingInstructions(
  shipmentId: string,
  accessToken: string,
): Promise<ApiResponse<ShippingInstruction[]>> {
  return apiGet<ShippingInstruction[]>(`${BASE}/${shipmentId}/shipping-instructions`, tok(accessToken));
}

export function createShippingInstruction(
  shipmentId: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<ApiResponse<ShippingInstruction>> {
  return apiPost<ShippingInstruction>(`${BASE}/${shipmentId}/shipping-instructions`, body, tok(accessToken));
}

export function updateShippingInstruction(
  shipmentId: string,
  siId: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<ApiResponse<ShippingInstruction>> {
  return apiPatch<ShippingInstruction>(`${BASE}/${shipmentId}/shipping-instructions/${siId}`, body, tok(accessToken));
}

export function deleteShippingInstruction(
  shipmentId: string,
  siId: string,
  accessToken: string,
): Promise<ApiResponse<unknown>> {
  return apiDelete<unknown>(`${BASE}/${shipmentId}/shipping-instructions/${siId}`, tok(accessToken));
}

/* ───── invoices ───── */

export function listInvoices(
  shipmentId: string,
  accessToken: string,
): Promise<ApiResponse<Invoice[]>> {
  return apiGet<Invoice[]>(`${BASE}/${shipmentId}/invoices`, tok(accessToken));
}

export function createInvoice(
  shipmentId: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<ApiResponse<Invoice>> {
  return apiPost<Invoice>(`${BASE}/${shipmentId}/invoices`, body, tok(accessToken));
}

export function updateInvoice(
  shipmentId: string,
  invId: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<ApiResponse<Invoice>> {
  return apiPatch<Invoice>(`${BASE}/${shipmentId}/invoices/${invId}`, body, tok(accessToken));
}

export function deleteInvoice(
  shipmentId: string,
  invId: string,
  accessToken: string,
): Promise<ApiResponse<unknown>> {
  return apiDelete<unknown>(`${BASE}/${shipmentId}/invoices/${invId}`, tok(accessToken));
}

/* ───── packing lists ───── */

export function listPackingLists(
  shipmentId: string,
  accessToken: string,
): Promise<ApiResponse<PackingList[]>> {
  return apiGet<PackingList[]>(`${BASE}/${shipmentId}/packing-lists`, tok(accessToken));
}

export function createPackingList(
  shipmentId: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<ApiResponse<PackingList>> {
  return apiPost<PackingList>(`${BASE}/${shipmentId}/packing-lists`, body, tok(accessToken));
}

export function updatePackingList(
  shipmentId: string,
  plId: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<ApiResponse<PackingList>> {
  return apiPatch<PackingList>(`${BASE}/${shipmentId}/packing-lists/${plId}`, body, tok(accessToken));
}

export function deletePackingList(
  shipmentId: string,
  plId: string,
  accessToken: string,
): Promise<ApiResponse<unknown>> {
  return apiDelete<unknown>(`${BASE}/${shipmentId}/packing-lists/${plId}`, tok(accessToken));
}
