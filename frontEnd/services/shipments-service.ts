/**
 * Shipments API — services layer. All shipment API calls go through here.
 */

import { apiGet, apiPost, apiPatch, apiPut, apiDelete, apiRequest } from "./api-client";
import type {
  ShipmentListItem,
  ShipmentListFilterOptions,
  ShipmentDetail,
  ListShipmentsQuery,
  ShipmentTimelineEntry,
  ShipmentStatusSummaryData,
  ShipmentBid,
  RecentForwarderBid,
  ShipmentNote,
  ShipmentActivityItem,
  ShipmentDocumentListItem,
  ShipmentImportCsvResult,
  ShipmentImportHistoryItem,
  FreightChargeCurrency,
} from "@/types/shipments";
import type { ApiResponse } from "@/types/api";
import { config } from "@/lib/config";
import { COOKIE_AUTH_SENTINEL } from "@/lib/constants";

function appendMulti(params: URLSearchParams, key: string, values: string[] | undefined) {
  values?.forEach((v) => params.append(key, v));
}

function buildQueryString(query: ListShipmentsQuery): string {
  const params = new URLSearchParams();
  if (query.page != null) params.set("page", String(query.page));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  appendMulti(params, "statuses", query.statuses);
  if (query.supplier_name) params.set("supplier_name", query.supplier_name);
  if (query.po_number) params.set("po_number", query.po_number);
  if (query.from_date) params.set("from_date", query.from_date);
  if (query.to_date) params.set("to_date", query.to_date);
  if (query.created_from) params.set("created_from", query.created_from);
  if (query.created_to) params.set("created_to", query.created_to);
  if (query.po_from_date) params.set("po_from_date", query.po_from_date);
  if (query.po_to_date) params.set("po_to_date", query.po_to_date);
  if (query.active_pipeline) params.set("active_pipeline", "true");
  query.pts?.forEach((p) => params.append("pt", p));
  query.plants?.forEach((p) => params.append("plant", p));
  if (!query.pts?.length && query.pt) params.set("pt", query.pt);
  if (!query.plants?.length && query.plant) params.set("plant", query.plant);
  query.product_classifications?.forEach((c) => params.append("product_classification", c));
  if (!query.product_classifications?.length && query.product_classification) {
    params.set("product_classification", query.product_classification);
  }
  if (query.shipment_method) params.set("shipment_method", query.shipment_method);
  appendMulti(params, "shipment_method_multi", query.shipment_methods);
  query.vendor_names_exact?.forEach((v) => params.append("vendor_name_exact", v));
  if (!query.vendor_names_exact?.length && query.vendor_name_exact) {
    params.set("vendor_name_exact", query.vendor_name_exact);
  }
  appendMulti(params, "shipment_no", query.shipment_nos);
  appendMulti(params, "po_number_exact", query.po_numbers);
  appendMulti(params, "incoterm", query.incoterms);
  appendMulti(params, "pib_type", query.pib_types);
  appendMulti(params, "ship_by", query.ship_bys);
  appendMulti(params, "forwarder_name", query.forwarder_names);
  appendMulti(params, "pic_name", query.pic_names);
  appendMulti(params, "etd_date", query.etd_dates);
  appendMulti(params, "eta_date", query.eta_dates);
  appendMulti(params, "origin_port_name", query.origin_port_names);
  appendMulti(params, "destination_port_name", query.destination_port_names);
  if (query.dormant_remaining_qty) params.set("dormant_remaining_qty", "true");
  if (query.dormant_days != null) params.set("dormant_days", String(query.dormant_days));
  if (query.performance_eta_late) params.set("performance_eta_late", "true");
  if (query.sort_by) params.set("sort_by", query.sort_by);
  if (query.sort_dir) params.set("sort_dir", query.sort_dir);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function listShipments(
  query: ListShipmentsQuery,
  accessToken: string | null
): Promise<ApiResponse<ShipmentListItem[]>> {
  const path = `shipments${buildQueryString(query)}`;
  return apiGet<ShipmentListItem[]>(path, accessToken);
}

export async function getShipmentListFilterOptions(
  accessToken: string | null
): Promise<ApiResponse<ShipmentListFilterOptions>> {
  return apiGet<ShipmentListFilterOptions>("shipments/list-filter-options", accessToken);
}

export async function getShipmentDetail(
  id: string,
  accessToken: string | null
): Promise<ApiResponse<ShipmentDetail>> {
  return apiGet<ShipmentDetail>(`shipments/${id}`, accessToken);
}

export interface UpdateShipmentPayload {
  etd?: string;
  eta?: string;
  atd?: string;
  ata?: string;
  depo?: boolean;
  depo_location?: string | null;
  /** Shipment remarks (backend UpdateShipmentDto). */
  remarks?: string;
  pib_type?: string;
  no_request_pib?: string;
  ppjk_mkl?: string;
  nopen?: string;
  nopen_date?: string;
  ship_by?: string | null;
  bl_awb?: string;
  insurance_no?: string;
  coo?: string;
  incoterm_amount?: number;
  incoterm_currency?: FreightChargeCurrency;
  cbm?: number | null;
  net_weight_mt?: number;
  gross_weight_mt?: number;
  origin_port_name?: string;
  origin_port_country?: string;
  forwarder_name?: string;
  shipment_method?: string;
  destination_port_name?: string;
  destination_port_country?: string;
  vendor_name?: string;
  warehouse_name?: string;
  incoterm?: string;
  closed_at?: string;
  close_reason?: string;
  kawasan_berikat?: string | null;
  surveyor?: string | null;
  product_classification?: string | null;
  unit_20ft?: boolean;
  unit_40ft?: boolean;
  unit_package?: boolean;
  unit_20_iso_tank?: boolean;
  container_count_20ft?: number | null;
  container_count_40ft?: number | null;
  package_count?: number | null;
  container_count_20_iso_tank?: number | null;
  /** BM total (IDR), user-entered. */
  bm?: number | null;
  /** PPN total (IDR), user-entered. */
  ppn_amount?: number | null;
  /** PPH total (IDR), user-entered. */
  pph_amount?: number | null;
}

export async function updateShipment(
  id: string,
  payload: UpdateShipmentPayload,
  accessToken: string | null
): Promise<ApiResponse<ShipmentDetail>> {
  return apiPut<ShipmentDetail>(`shipments/${id}`, payload, accessToken);
}

/** Soft-delete shipment (decouples POs server-side; row kept for audit). */
export async function softDeleteShipment(
  id: string,
  accessToken: string | null
): Promise<ApiResponse<unknown>> {
  return apiDelete(`shipments/${id}`, accessToken);
}

export async function updateShipmentStatus(
  id: string,
  newStatus: string,
  remarks: string | undefined,
  accessToken: string | null
): Promise<ApiResponse<{ shipment_id: string; previous_status: string; current_status: string; updated_at: string }>> {
  return apiPatch(`shipments/${id}/status`, { new_status: newStatus, remarks }, accessToken);
}

export async function getShipmentTimeline(
  id: string,
  accessToken: string | null
): Promise<ApiResponse<ShipmentTimelineEntry[]>> {
  return apiGet<ShipmentTimelineEntry[]>(`shipments/${id}/timeline`, accessToken);
}

export async function getShipmentStatusSummary(
  id: string,
  accessToken: string | null
): Promise<ApiResponse<ShipmentStatusSummaryData>> {
  return apiGet<ShipmentStatusSummaryData>(`shipments/${id}/status-summary`, accessToken);
}

export async function getShipmentActivityLog(
  id: string,
  accessToken: string | null
): Promise<ApiResponse<{ items: ShipmentActivityItem[] }>> {
  return apiGet<{ items: ShipmentActivityItem[] }>(`shipments/${id}/activity-log`, accessToken);
}

export async function listShipmentNotes(
  shipmentId: string,
  accessToken: string | null
): Promise<ApiResponse<ShipmentNote[]>> {
  return apiGet<ShipmentNote[]>(`shipments/${shipmentId}/notes`, accessToken);
}

export async function createShipmentNote(
  shipmentId: string,
  note: string,
  accessToken: string | null
): Promise<ApiResponse<ShipmentNote>> {
  return apiPost<ShipmentNote>(`shipments/${shipmentId}/notes`, { note }, accessToken);
}

export async function couplePo(
  shipmentId: string,
  intakeIds: string[],
  accessToken: string | null
): Promise<ApiResponse<ShipmentDetail>> {
  return apiPost<ShipmentDetail>(`shipments/${shipmentId}/couple-po`, { intake_ids: intakeIds }, accessToken);
}

export async function decouplePo(
  shipmentId: string,
  intakeId: string,
  reason: string | undefined,
  accessToken: string | null
): Promise<ApiResponse<unknown>> {
  return apiPost(`shipments/${shipmentId}/decouple-po`, { intake_id: intakeId, reason }, accessToken);
}

export async function listShipmentBids(
  shipmentId: string,
  accessToken: string | null
): Promise<ApiResponse<ShipmentBid[]>> {
  return apiGet<ShipmentBid[]>(`shipments/${shipmentId}/bids`, accessToken);
}

export async function listRecentShipmentForwarders(
  shipmentId: string,
  limit: number,
  accessToken: string | null,
  /** Filter lane origin country (optional; defaults to shipment’s saved value). */
  originPortCountry?: string | null
): Promise<ApiResponse<RecentForwarderBid[]>> {
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  q.set("shipment_id", shipmentId);
  const oc = originPortCountry != null ? String(originPortCountry).trim() : "";
  if (oc) q.set("origin_port_country", oc);
  return apiGet<RecentForwarderBid[]>(`shipments/bids/recent?${q.toString()}`, accessToken);
}

export interface CreateShipmentBidPayload {
  forwarder_name: string;
  service_amount?: number;
  service_amount_currency?: FreightChargeCurrency;
  duration?: string;
  /** YYYY-MM-DD; optional. */
  quotation_expires_at?: string;
  origin_port?: string;
  destination_port?: string;
  ship_via?: string;
}

export async function createShipmentBid(
  shipmentId: string,
  payload: CreateShipmentBidPayload,
  accessToken: string | null
): Promise<ApiResponse<ShipmentBid>> {
  return apiPost<ShipmentBid>(`shipments/${shipmentId}/bids`, payload, accessToken);
}

export interface UpdateShipmentBidPayload {
  forwarder_name?: string;
  service_amount?: number;
  service_amount_currency?: FreightChargeCurrency;
  duration?: string;
  quotation_expires_at?: string | null;
  origin_port?: string;
  destination_port?: string;
  ship_via?: string;
}

export async function updateShipmentBid(
  shipmentId: string,
  bidId: string,
  payload: UpdateShipmentBidPayload,
  accessToken: string | null
): Promise<ApiResponse<ShipmentBid>> {
  return apiPut<ShipmentBid>(`shipments/${shipmentId}/bids/${bidId}`, payload, accessToken);
}

export async function deleteShipmentBid(
  shipmentId: string,
  bidId: string,
  accessToken: string | null
): Promise<ApiResponse<{ id: string }>> {
  return apiDelete(`shipments/${shipmentId}/bids/${bidId}`, accessToken);
}

export async function uploadShipmentBidQuotation(
  shipmentId: string,
  bidId: string,
  file: File,
  accessToken: string | null
): Promise<ApiResponse<ShipmentBid>> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<ShipmentBid>(`shipments/${shipmentId}/bids/${bidId}/quotation`, {
    method: "POST",
    body: form,
    accessToken,
  });
}

export async function updateShipmentPoMapping(
  shipmentId: string,
  intakeId: string,
  payload: { invoice_no?: string | null; currency_rate?: number | null },
  accessToken: string | null
): Promise<ApiResponse<ShipmentDetail>> {
  return apiPatch<ShipmentDetail>(`shipments/${shipmentId}/po/${intakeId}`, payload, accessToken);
}

export async function updateShipmentPoLines(
  shipmentId: string,
  intakeId: string,
  lines: {
    item_id: string;
    received_qty: number;
    net_weight_mt: number | null;
    gross_weight_mt: number | null;
    bm_percentage?: number | null;
    ppn_percentage?: number | null;
    pph_percentage?: number | null;
  }[],
  accessToken: string | null
): Promise<ApiResponse<ShipmentDetail>> {
  return apiPatch<ShipmentDetail>(`shipments/${shipmentId}/po/${intakeId}/lines`, { lines }, accessToken);
}

export async function listShipmentDocuments(
  shipmentId: string,
  accessToken: string | null
): Promise<ApiResponse<ShipmentDocumentListItem[]>> {
  return apiGet<ShipmentDocumentListItem[]>(`shipments/${shipmentId}/documents`, accessToken);
}

export async function uploadShipmentDocument(
  shipmentId: string,
  file: File,
  documentType: string,
  status: "DRAFT" | "FINAL" | null,
  accessToken: string | null,
  intakeId?: string | null
): Promise<ApiResponse<ShipmentDocumentListItem>> {
  const form = new FormData();
  form.append("file", file);
  form.append("document_type", documentType);
  if (status) form.append("status", status);
  if (intakeId) form.append("intake_id", intakeId);
  return apiRequest<ShipmentDocumentListItem>(`shipments/${shipmentId}/documents`, {
    method: "POST",
    body: form,
    accessToken,
  });
}

export async function deleteShipmentDocument(
  shipmentId: string,
  documentId: string,
  accessToken: string | null
): Promise<ApiResponse<{ id: string }>> {
  return apiDelete<{ id: string }>(`shipments/${shipmentId}/documents/${documentId}`, accessToken);
}

export async function importShipmentCombinedCsv(
  file: File,
  accessToken: string | null
): Promise<ApiResponse<ShipmentImportCsvResult>> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<ShipmentImportCsvResult>("shipments/import/combined-csv", {
    method: "POST",
    body: form,
    accessToken,
  });
}

export async function downloadShipmentCombinedTemplate(accessToken: string | null): Promise<Blob> {
  const url = `${config.apiBaseUrl}/shipments/import/combined-template-csv`;
  const headers: Record<string, string> = {};
  if (accessToken && accessToken !== COOKIE_AUTH_SENTINEL) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(url, { method: "GET", headers, credentials: "include" });
  if (!res.ok) throw new Error("Failed to download shipment template");
  return res.blob();
}

export async function listShipmentImportHistory(
  accessToken: string | null,
  limit = 20
): Promise<ApiResponse<ShipmentImportHistoryItem[]>> {
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  return apiGet<ShipmentImportHistoryItem[]>(`shipments/import/history?${q.toString()}`, accessToken);
}


