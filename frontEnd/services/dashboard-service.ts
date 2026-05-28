/**
 * Dashboard API — services layer. All dashboard API calls go through here.
 */

import { listPo } from "./po-service";
import { listShipments } from "./shipments-service";
import { apiGet } from "./api-client";
import type { ApiResponse } from "@/types/api";
import type {
  DeliveredClassificationAggItem,
  DeliveredManagementItem,
  DeliveredManagementQuery,
  DeliveredPtPlantAggItem,
  DeliveredPtPlantAggQuery,
  ProcurementPlantReportPayload,
} from "@/types/dashboard";
import type {
  ShipmentAnalyticsLineAggRow,
  ShipmentAnalyticsLinesQuery,
  ShipmentAnalyticsQuery,
  ShipmentAnalyticsSummary,
} from "@/types/analytics";

/** Counts for dashboard: new PO detected (NEW_PO_DETECTED), claimed awaiting allocation (CLAIMED). Rejects if API errors. */
export async function getPoDashboardCounts(accessToken: string | null): Promise<{
  newPoDetected: number;
  awaitingAssignment: number;
}> {
  let newPoDetected = 0;
  let awaitingAssignment = 0;
  if (!accessToken) return { newPoDetected, awaitingAssignment };
  const [r1, r2] = await Promise.all([
    listPo({ page: 1, limit: 1, intake_status: "NEW_PO_DETECTED" }, accessToken),
    listPo({ page: 1, limit: 1, intake_status: "CLAIMED" }, accessToken),
  ]);
  if (!r1.success) throw new Error(r1.message ?? "Failed to load PO counts");
  if (!r2.success) throw new Error(r2.message ?? "Failed to load PO counts");
  if (r1.meta && typeof r1.meta.total === "number") newPoDetected = r1.meta.total;
  if (r2.meta && typeof r2.meta.total === "number") awaitingAssignment = r2.meta.total;
  return { newPoDetected, awaitingAssignment };
}

/** Counts for dashboard: active shipments, customs clearance, delivered. Rejects if API errors. */
export async function getShipmentDashboardCounts(accessToken: string | null): Promise<{
  activeShipments: number;
  customsClearance: number;
  delivered: number;
}> {
  let activeShipments = 0;
  let customsClearance = 0;
  let delivered = 0;
  if (!accessToken) return { activeShipments, customsClearance, delivered };
  const [rActive, rCustoms, rDelivered] = await Promise.all([
    listShipments({ page: 1, limit: 1, active_pipeline: true }, accessToken),
    listShipments({ page: 1, limit: 1, status: "CUSTOMS_CLEARANCE" }, accessToken),
    listShipments({ page: 1, limit: 1, status: "DELIVERED" }, accessToken),
  ]);
  if (!rActive.success) throw new Error(rActive.message ?? "Failed to load shipment counts");
  if (!rCustoms.success) throw new Error(rCustoms.message ?? "Failed to load shipment counts");
  if (!rDelivered.success) throw new Error(rDelivered.message ?? "Failed to load shipment counts");
  if (rActive.meta && typeof rActive.meta.total === "number") activeShipments = rActive.meta.total;
  if (rCustoms.meta && typeof rCustoms.meta.total === "number") customsClearance = rCustoms.meta.total;
  if (rDelivered.meta && typeof rDelivered.meta.total === "number") delivered = rDelivered.meta.total;
  return { activeShipments, customsClearance, delivered };
}

export async function getDeliveredManagementSummary(
  query: DeliveredManagementQuery,
  accessToken: string | null
): Promise<ApiResponse<DeliveredManagementItem[]>> {
  const params = new URLSearchParams();
  if (query.month != null) params.set("month", String(query.month));
  if (query.year != null) params.set("year", String(query.year));
  const qs = params.toString();
  return apiGet<DeliveredManagementItem[]>(
    `dashboard/delivered-management${qs ? `?${qs}` : ""}`,
    accessToken
  );
}

export async function getDeliveredByPtPlantAgg(
  query: DeliveredPtPlantAggQuery,
  accessToken: string | null
): Promise<ApiResponse<DeliveredPtPlantAggItem[]>> {
  const params = new URLSearchParams();
  if (query.month != null) params.set("month", String(query.month));
  if (query.year != null) params.set("year", String(query.year));
  if (query.pt) params.set("pt", query.pt);
  if (query.plant) params.set("plant", query.plant);
  const qs = params.toString();
  return apiGet<DeliveredPtPlantAggItem[]>(
    `dashboard/delivered-by-pt-plant${qs ? `?${qs}` : ""}`,
    accessToken
  );
}

export async function getDeliveredByClassificationAgg(
  query: DeliveredManagementQuery,
  accessToken: string | null
): Promise<ApiResponse<DeliveredClassificationAggItem[]>> {
  const params = new URLSearchParams();
  if (query.month != null) params.set("month", String(query.month));
  if (query.year != null) params.set("year", String(query.year));
  const qs = params.toString();
  return apiGet<DeliveredClassificationAggItem[]>(
    `dashboard/delivered-by-classification${qs ? `?${qs}` : ""}`,
    accessToken
  );
}

export async function getProcurementPlantReport(
  query: { month: number; year: number },
  accessToken: string | null
): Promise<ApiResponse<ProcurementPlantReportPayload>> {
  const params = new URLSearchParams();
  params.set("month", String(query.month));
  params.set("year", String(query.year));
  return apiGet<ProcurementPlantReportPayload>(
    `dashboard/procurement-plant-report?${params.toString()}`,
    accessToken
  );
}

export async function getShipmentAnalytics(
  query: ShipmentAnalyticsQuery,
  accessToken: string | null
): Promise<ApiResponse<ShipmentAnalyticsSummary>> {
  const params = new URLSearchParams();
  params.set("date_from", query.date_from);
  params.set("date_to", query.date_to);
  query.pts?.forEach((p) => params.append("pt", p));
  query.plants?.forEach((p) => params.append("plant", p));
  query.vendor_names?.forEach((v) => params.append("vendor_name", v));
  query.product_classifications?.forEach((c) => params.append("product_classification", c));
  if (query.shipment_method) params.set("shipment_method", query.shipment_method);
  return apiGet<ShipmentAnalyticsSummary>(
    `dashboard/shipment-analytics?${params.toString()}`,
    accessToken
  );
}

export async function getShipmentAnalyticsLines(
  query: ShipmentAnalyticsLinesQuery,
  accessToken: string | null
): Promise<ApiResponse<ShipmentAnalyticsLineAggRow[]>> {
  const params = new URLSearchParams();
  params.set("date_from", query.date_from);
  params.set("date_to", query.date_to);
  params.set("detail_kind", query.detail_kind);
  query.pts?.forEach((p) => params.append("pt", p));
  query.plants?.forEach((p) => params.append("plant", p));
  query.vendor_names?.forEach((v) => params.append("vendor_name", v));
  query.product_classifications?.forEach((c) => params.append("product_classification", c));
  if (query.shipment_method) params.set("shipment_method", query.shipment_method);
  if (query.detail_plant != null && query.detail_plant !== "") params.set("detail_plant", query.detail_plant);
  if (query.detail_classification != null && query.detail_classification !== "")
    params.set("detail_classification", query.detail_classification);
  return apiGet<ShipmentAnalyticsLineAggRow[]>(
    `dashboard/shipment-analytics/lines?${params.toString()}`,
    accessToken
  );
}
