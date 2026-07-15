/** GET /dashboard/shipment-analytics */
export interface ShipmentAnalyticsPlantRow {
  plant: string;
  count: number;
}

export interface ShipmentAnalyticsClassificationRow {
  classification: string;
  count: number;
}

export interface ShipmentAnalyticsLogistics {
  air: number;
  sea: number;
  other: number;
}

export interface FclContainerEntry {
  /** Short identifier matching `fclSubType` on LogisticsDetailSourceRow (e.g. "20FT", "40HC"). */
  slug: string;
  /** Human-readable label (e.g. "20′", "40′ HC"). */
  label: string;
  /** Total container count across all delivered FCL shipments in the date range. */
  count: number;
  /** Number of FCL shipments that include at least one of this container type. */
  shipment_count: number;
}

export interface SeaLogisticsBreakdown {
  by_ship_by: { ship_by: string; count: number }[];
  lcl_package_count_total: number;
  /** Total CBM (m³) across LCL sea shipments in scope. */
  lcl_cbm_total: number;
  /**
   * One entry per FCL container type that has count > 0.
   * Derived from the backend FCL_CONTAINER_REGISTRY — no frontend hardcoding required.
   */
  fcl_containers: FclContainerEntry[];
  /** Total delivered bulk sea shipments in the filtered set. */
  bulk_shipment_count: number;
}

export interface ShipmentAnalyticsSummary {
  total_shipments: number;
  /** Shipments with no product classification set (omitted from the chart). */
  unclassified_shipments: number;
  by_plant: ShipmentAnalyticsPlantRow[];
  by_classification: ShipmentAnalyticsClassificationRow[];
  logistics: ShipmentAnalyticsLogistics;
  sea_logistics: SeaLogisticsBreakdown;
  vendor_options: string[];
}

export interface ShipmentAnalyticsQuery {
  date_from: string;
  date_to: string;
  /** Repeat `pt` query param on the wire; first-PO PT, OR semantics. */
  pts?: string[];
  plants?: string[];
  vendor_names?: string[];
  product_classifications?: string[];
  shipment_method?: string;
}

/** GET /dashboard/classification-qty — total delivered qty per classification with unit conversion. */
export interface ClassificationQtyRow {
  /** Canonical label: "Chemical" | "Package" | "Spare Parts" */
  classification: string;
  /** Qty already converted to the canonical display unit. */
  total_qty: number;
  /** "MT" | "set" | "pcs" */
  unit: string;
}

/** GET /dashboard/shipment-analytics/lines — aggregated PO lines for plant/classification drill. */
export interface ShipmentAnalyticsLinesQuery extends ShipmentAnalyticsQuery {
  detail_kind: "plant" | "classification";
  detail_plant?: string;
  detail_classification?: string;
}

export interface ShipmentAnalyticsLineAggRow {
  item_description: string;
  pt: string | null;
  plant: string | null;
  unit: string | null;
  total_qty_delivered: number;
  total_price_idr: number;
}

/** GET /dashboard/shipment-analytics/lines — drill-down payload. */
export interface ShipmentAnalyticsLinesResult {
  shipment_count: number;
  rows: ShipmentAnalyticsLineAggRow[];
}

/** GET /dashboard/shipment-analytics/lines/shipments — expand grouped line to whole shipments. */
export interface ShipmentAnalyticsLineGroupShipmentsQuery extends ShipmentAnalyticsLinesQuery {
  group_item_description: string;
  group_pt?: string;
  group_plant?: string;
}

export interface ShipmentAnalyticsGroupShipmentRow {
  id: string;
  shipment_number: string;
  current_status: string;
  group_qty_delivered: number;
  group_amount_idr: number;
}

export type LogisticsTransportMode = "AIR" | "LCL" | "FCL" | "BULK";

/** GET /dashboard/logistics-rows/shipments */
export interface LogisticsGroupShipmentsQuery extends ShipmentAnalyticsQuery {
  group_pt_plant: string;
  group_item_description: string;
  transport_mode: LogisticsTransportMode;
  fcl_sub_type?: string;
}

export function analyticsLineGroupKey(row: Pick<ShipmentAnalyticsLineAggRow, "item_description" | "pt" | "plant">): string {
  return `${row.item_description}|${row.pt ?? ""}|${row.plant ?? ""}`;
}

export function logisticsLineGroupKey(ptPlant: string, itemDescription: string): string {
  return `${ptPlant}|${itemDescription}`;
}

/** One flat row from GET /dashboard/post-arrival-lead. */
export interface PostArrivalLeadRow {
  load_type: string;
  /** Null when is_type_total = true (aggregate row for AIR / FCL / LCL). */
  plant: string | null;
  avg_days: number;
  shipment_count: number;
  /** True = load-type aggregate; false = per-plant detail. */
  is_type_total: boolean;
}

/** GET /dashboard/financial-summary — aggregated financial breakdown for DELIVERED shipments. */
export interface FinancialSummaryResult {
  import_value_idr: number;
  /** BM (Bea Masuk) amount — shown in Financial visibility. */
  bm_idr: number;
  ppn_idr: number;
  pph_idr: number;
  freight_idr: number;
  /** import_value_idr + bm_idr (internal; not shown as a separate breakdown row). */
  nilai_pabean_idr: number;
  /** import_value_idr + bm_idr + ppn_idr + pph_idr + freight_idr */
  total_idr: number;
}

/** Processed structure used in the UI after grouping flat rows by load_type. */
export interface PostArrivalLeadItem {
  load_type: string;
  avg_days: number;
  shipment_count: number;
  by_plant: Array<{ plant: string; avg_days: number; shipment_count: number }>;
}

/** GET /dashboard/post-arrival-lead/shipments — expand plant group to shipments. */
export interface PostArrivalLeadShipmentsQuery extends ShipmentAnalyticsQuery {
  load_type: string;
  group_pt_plant: string;
}

export interface PostArrivalLeadShipmentRow {
  id: string;
  shipment_number: string;
  current_status: string;
  lead_days: number;
  ata: string | null;
  closed_at: string | null;
}

export function postArrivalPlantGroupKey(loadType: string, plant: string): string {
  return `${loadType}|${plant}`;
}
