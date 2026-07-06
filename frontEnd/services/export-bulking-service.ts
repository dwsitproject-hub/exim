import { apiGet, apiPost, apiPatch, apiPut, apiDelete, apiRequest } from "./api-client";
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
  SapLine,
  SapLineUpsertPayload,
  BillingLine,
  BillingLineUpsertPayload,
  BillOfLadingLine,
  BillOfLadingUpsertPayload,
  SiPebFieldsUpsertPayload,
  ExportBulkingDocumentListItem,
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
  if (q.assignment) params.set("assignment", q.assignment);
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

/* ───── SAP lines (Data SAP per SO) ───── */

export function listSapLines(
  shipmentId: string,
  accessToken: string,
): Promise<ApiResponse<SapLine[]>> {
  return apiGet<SapLine[]>(`${BASE}/${shipmentId}/sap-lines`, tok(accessToken));
}

export function upsertSapLines(
  shipmentId: string,
  lines: SapLineUpsertPayload[],
  accessToken: string,
): Promise<ApiResponse<SapLine[]>> {
  return apiPut<SapLine[]>(`${BASE}/${shipmentId}/sap-lines`, { lines }, tok(accessToken));
}

/* ───── Billing lines (Billing & Levy per SO) ───── */

export function listBillingLines(
  shipmentId: string,
  accessToken: string,
): Promise<ApiResponse<BillingLine[]>> {
  return apiGet<BillingLine[]>(`${BASE}/${shipmentId}/billing-lines`, tok(accessToken));
}

export function upsertBillingLines(
  shipmentId: string,
  lines: BillingLineUpsertPayload[],
  accessToken: string,
): Promise<ApiResponse<BillingLine[]>> {
  return apiPut<BillingLine[]>(`${BASE}/${shipmentId}/billing-lines`, { lines }, tok(accessToken));
}

/* ───── Bills of lading ───── */

export function listBillsOfLading(
  shipmentId: string,
  accessToken: string,
): Promise<ApiResponse<BillOfLadingLine[]>> {
  return apiGet<BillOfLadingLine[]>(`${BASE}/${shipmentId}/bills-of-lading`, tok(accessToken));
}

export function upsertBillsOfLading(
  shipmentId: string,
  lines: BillOfLadingUpsertPayload[],
  accessToken: string,
): Promise<ApiResponse<BillOfLadingLine[]>> {
  return apiPut<BillOfLadingLine[]>(`${BASE}/${shipmentId}/bills-of-lading`, { lines }, tok(accessToken));
}

export function upsertSiPebFields(
  shipmentId: string,
  items: SiPebFieldsUpsertPayload[],
  accessToken: string,
): Promise<ApiResponse<ShippingInstruction[]>> {
  return apiPut<ShippingInstruction[]>(`${BASE}/${shipmentId}/shipping-instructions/peb-fields`, { items }, tok(accessToken));
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

export function getSiInvoiceAllocation(
  shipmentId: string,
  siId: string,
  accessToken: string,
): Promise<ApiResponse<import("@/types/export-bulking").SiInvoiceAllocation>> {
  return apiGet(
    `${BASE}/${shipmentId}/shipping-instructions/${siId}/invoice-allocation`,
    tok(accessToken),
  );
}

export function finalizeInvoice(
  shipmentId: string,
  invId: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<ApiResponse<Invoice>> {
  return apiPost<Invoice>(`${BASE}/${shipmentId}/invoices/${invId}/finalize`, body, tok(accessToken));
}

export function amendInvoice(
  shipmentId: string,
  invId: string,
  body: Record<string, unknown>,
  accessToken: string,
): Promise<ApiResponse<Invoice>> {
  return apiPost<Invoice>(`${BASE}/${shipmentId}/invoices/${invId}/amend`, body, tok(accessToken));
}

export function listInvoiceEvents(
  shipmentId: string,
  invId: string,
  accessToken: string,
): Promise<ApiResponse<import("@/types/export-bulking").InvoiceEvent[]>> {
  return apiGet(`${BASE}/${shipmentId}/invoices/${invId}/events`, tok(accessToken));
}

export function getInvoiceDiff(
  shipmentId: string,
  invId: string,
  accessToken: string,
): Promise<ApiResponse<{
  status: string;
  changes: import("@/types/export-bulking").InvoiceFieldChange[];
  draft_snapshot: unknown;
  final_snapshot: unknown | null;
  finalized_at?: string | null;
}>> {
  return apiGet(`${BASE}/${shipmentId}/invoices/${invId}/diff`, tok(accessToken));
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

/* ───── uploaded documents ───── */

export function listExportBulkingDocuments(
  shipmentId: string,
  accessToken: string,
): Promise<ApiResponse<ExportBulkingDocumentListItem[]>> {
  return apiGet<ExportBulkingDocumentListItem[]>(`${BASE}/${shipmentId}/documents`, tok(accessToken));
}

export function uploadExportBulkingDocument(
  shipmentId: string,
  file: File,
  documentType: string,
  accessToken: string,
): Promise<ApiResponse<ExportBulkingDocumentListItem>> {
  const form = new FormData();
  form.append("file", file);
  form.append("document_type", documentType);
  return apiRequest<ExportBulkingDocumentListItem>(`${BASE}/${shipmentId}/documents`, {
    method: "POST",
    body: form,
    accessToken: tok(accessToken),
  });
}

export function deleteExportBulkingDocument(
  shipmentId: string,
  documentId: string,
  accessToken: string,
): Promise<ApiResponse<{ id: string }>> {
  return apiDelete<{ id: string }>(`${BASE}/${shipmentId}/documents/${documentId}`, tok(accessToken));
}

export interface ExportBulkingDocumentationAssignee {
  id: string;
  name: string;
  email: string;
}

export function listExportBulkingDocumentationAssignees(
  accessToken: string,
): Promise<ApiResponse<ExportBulkingDocumentationAssignee[]>> {
  return apiGet<ExportBulkingDocumentationAssignee[]>(
    `${BASE}/documentation-assignees`,
    tok(accessToken),
  );
}

export function assignExportBulkingDocumentation(
  shipmentId: string,
  assigneeUserId: string | null,
  accessToken: string,
): Promise<ApiResponse<ExportBulkingListItem>> {
  return apiPatch<ExportBulkingListItem>(
    `${BASE}/${shipmentId}/documentation-assignment`,
    { assignee_user_id: assigneeUserId },
    tok(accessToken),
  );
}
