/** GET /dashboard/delivered-management — one row per delivered shipment in the period. */
export interface DeliveredManagementItem {
  shipment_id: string;
  shipment_number: string;
  pt: string | null;
  plant: string | null;
  product_classification: string | null;
  vendor_name: string | null;
  total_amount_idr: number;
  freight_charge: number | null;
  freight_charge_currency: string;
  total_qty: number;
}

export interface DeliveredManagementQuery {
  month?: number;
  year?: number;
}

export interface DeliveredPtPlantAggItem {
  pt: string | null;
  plant: string | null;
  total_amount_idr: number;
  total_qty: number;
}

export interface DeliveredPtPlantAggQuery extends DeliveredManagementQuery {
  pt?: string;
  plant?: string;
}

export type ClassificationBucketKey = "chemical" | "packaging" | "sparepart";

export interface DeliveredClassificationAggItem {
  classification_key: ClassificationBucketKey;
  label: string;
  unit: string;
  total_amount_idr: number;
  total_qty: number;
}

/** GET /dashboard/procurement-plant-report — PT × plant × item sections. */
export interface ProcurementReportMetrics {
  amount_usd: number;
  qty: number;
}

export interface ProcurementReportRow {
  pt: string;
  plant: string;
  item: string;
  display_unit: string | null;
  ytd: ProcurementReportMetrics;
  month: ProcurementReportMetrics;
  prev_month: ProcurementReportMetrics;
}

export interface ProcurementReportSection {
  id: ClassificationBucketKey;
  title: string;
  section_unit_hint: string;
  rows: ProcurementReportRow[];
  totals: {
    ytd: ProcurementReportMetrics;
    month: ProcurementReportMetrics;
    prev_month: ProcurementReportMetrics;
  };
}

export interface ProcurementPlantReportPayload {
  year: number;
  month: number;
  month_label: string;
  prev_month_label: string;
  ytd_label: string;
  idr_per_usd_used: number;
  sections: ProcurementReportSection[];
}
/**
 * Dashboard API types — align with backend GET /dashboard/import-summary, import-status-summary.
 */

export interface ImportSummaryData {
  total_transactions: number;
  in_progress: number;
  delivered: number;
  delayed: number;
}

export interface StatusCountItem {
  status: string;
  count: number;
}

/** Adjustable threshold knobs for managerial insights tiles and alerts. */
export interface ManagerialThresholds {
  maxUnclaimedHours: number;
  dormantRemainingQtyDays: number;
  overdueCustomsDays: number;
  highValueShipmentAmountUsd: number;
  uncoupledValueWarningUsd: number;
}
