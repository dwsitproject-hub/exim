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

export interface SeaLogisticsBreakdown {
  by_ship_by: { ship_by: string; count: number }[];
  lcl_package_count_total: number;
  fcl_container_totals: {
    container_20ft: number;
    container_40ft: number;
    iso_tank_20: number;
  };
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
