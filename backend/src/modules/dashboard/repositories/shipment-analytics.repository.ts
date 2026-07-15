import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import { classificationFilterSqlVariants } from "../../../shared/product-classification.js";
import { FCL_CONTAINER_REGISTRY } from "../../../shared/fcl-container-registry.js";

export interface ShipmentAnalyticsQuery {
  date_from: string;
  date_to: string;
  /** First-PO PT filter; multiple = OR. */
  pts?: string[];
  /** First-PO plant filter; multiple = OR. */
  plants?: string[];
  /** Case-insensitive exact vendor match; multiple = OR. */
  vendor_names?: string[];
  /** Shipment product classification (canonical); multiple = OR (legacy spellings expanded). */
  product_classifications?: string[];
  shipment_method?: string;
}

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
}

/** Breakdown for Sea shipments only (`shipment_method` = SEA). */
export interface SeaLogisticsBreakdown {
  /** Count of delivered shipments per `ship_by` (uppercased; blank → "OTHER"). */
  by_ship_by: { ship_by: string; count: number }[];
  /** Σ `package_count` on delivered Sea + LCL rows. */
  lcl_package_count_total: number;
  /** Σ `cbm` on delivered Sea + LCL rows (cubic metres). */
  lcl_cbm_total: number;
  /**
   * One entry per FCL container type that has count > 0 in the result set.
   * Derived from FCL_CONTAINER_REGISTRY — add a new row there to support new types.
   */
  fcl_containers: { slug: string; label: string; count: number; shipment_count: number }[];
  /** Bulk (BULK) sea shipments grouped by primary line item description (cargo). */
  bulk_cargo: { item_description: string; shipment_count: number }[];
}

export interface ShipmentAnalyticsSummary {
  total_shipments: number;
  /** Shipments with empty `product_classification` (excluded from `by_classification`). */
  unclassified_shipments: number;
  by_plant: ShipmentAnalyticsPlantRow[];
  /** Canonical classification (Chemical/Checmical merged, Packaging→Package); unset omitted. */
  by_classification: ShipmentAnalyticsClassificationRow[];
  logistics: ShipmentAnalyticsLogistics;
  /** Present for UI when drilling Sea; counts match filtered shipment set. */
  sea_logistics: SeaLogisticsBreakdown;
  vendor_options: string[];
}

const FIRST_PO_CTE = `first_po AS (
  SELECT DISTINCT ON (m.shipment_id)
    m.shipment_id,
    NULLIF(TRIM(i.pt), '') AS pt,
    NULLIF(TRIM(i.plant), '') AS plant
  FROM shipment_po_mapping m
  INNER JOIN shipments s ON s.id = m.shipment_id AND s.deleted_at IS NULL
  INNER JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
  ORDER BY m.shipment_id, i.po_number ASC NULLS LAST, i.created_at ASC
)`;

const FIRST_DESC_CTE = `first_desc AS (
  SELECT DISTINCT ON (m.shipment_id)
    m.shipment_id,
    TRIM(COALESCE(
      NULLIF(TRIM(COALESCE(r.item_description, '')), ''),
      NULLIF(TRIM(COALESCE(it.item_description, '')), ''),
      '(No description)'
    )) AS item_description
  FROM shipment_po_mapping m
  JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
  JOIN Import_purchase_order_items it ON it.import_purchase_order_id = i.id
  LEFT JOIN shipment_po_line_received r
    ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id
    AND r.item_id = it.id AND r.deleted_at IS NULL
  ORDER BY m.shipment_id, i.po_number ASC NULLS LAST, it.id ASC
)`;

function buildBaseWhereParams(q: ShipmentAnalyticsQuery): { whereParts: string[]; params: unknown[] } {
  const whereParts: string[] = [
    `(s.closed_at AT TIME ZONE 'UTC')::date >= $1::date`,
    `(s.closed_at AT TIME ZONE 'UTC')::date <= $2::date`,
    `s.deleted_at IS NULL`,
    `UPPER(TRIM(COALESCE(s.current_status, ''))) = 'DELIVERED'`,
    `s.closed_at IS NOT NULL`,
  ];
  const params: unknown[] = [q.date_from, q.date_to];
  let idx = 3;

  const pts = q.pts?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (pts.length === 1) {
    whereParts.push(`LOWER(TRIM(COALESCE(fp.pt, ''))) = LOWER($${idx++})`);
    params.push(pts[0]);
  } else if (pts.length > 1) {
    whereParts.push(`LOWER(TRIM(COALESCE(fp.pt, ''))) = ANY($${idx++}::text[])`);
    params.push(pts.map((p) => p.toLowerCase()));
  }

  const plants = q.plants?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (plants.length === 1) {
    whereParts.push(`LOWER(TRIM(COALESCE(fp.plant, ''))) = LOWER($${idx++})`);
    params.push(plants[0]);
  } else if (plants.length > 1) {
    whereParts.push(`LOWER(TRIM(COALESCE(fp.plant, ''))) = ANY($${idx++}::text[])`);
    params.push(plants.map((p) => p.toLowerCase()));
  }

  const vendors = q.vendor_names?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (vendors.length === 1) {
    whereParts.push(`LOWER(TRIM(COALESCE(s.vendor_name, ''))) = LOWER($${idx++})`);
    params.push(vendors[0]);
  } else if (vendors.length > 1) {
    whereParts.push(`LOWER(TRIM(COALESCE(s.vendor_name, ''))) = ANY($${idx++}::text[])`);
    params.push(vendors.map((v) => v.toLowerCase()));
  }

  const classCanon = q.product_classifications?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (classCanon.length > 0) {
    const variantSet = new Set<string>();
    for (const c of classCanon) {
      for (const v of classificationFilterSqlVariants(c)) {
        variantSet.add(v);
      }
    }
    const variants = [...variantSet];
    if (variants.length === 1) {
      whereParts.push(`TRIM(COALESCE(s.product_classification, '')) = $${idx++}`);
      params.push(variants[0]);
    } else {
      whereParts.push(`TRIM(COALESCE(s.product_classification, '')) = ANY($${idx++}::text[])`);
      params.push(variants);
    }
  }

  if (q.shipment_method?.trim()) {
    whereParts.push(`UPPER(TRIM(COALESCE(s.shipment_method, ''))) = UPPER($${idx++})`);
    params.push(q.shipment_method.trim());
  }

  return { whereParts, params };
}

const POST_ARRIVAL_BDAY_INDEX = (col: string) =>
  `(FLOOR((${col}::date - '2000-01-03'::date)::int / 7) * 5 + LEAST(EXTRACT(ISODOW FROM ${col}::date)::int, 5))`;

const POST_ARRIVAL_PLANT_EXPR = `CONCAT(
  COALESCE(NULLIF(TRIM(fp.pt), ''), '—'),
  ' – ',
  COALESCE(NULLIF(TRIM(fp.plant), ''), '(Unknown)')
)`;

const POST_ARRIVAL_LOAD_TYPE_EXPR = `CASE
  WHEN UPPER(TRIM(COALESCE(s.shipment_method, ''))) = 'AIR' THEN 'AIR'
  ELSE UPPER(TRIM(COALESCE(s.ship_by, '')))
END`;

function appendPostArrivalScopeFilters(whereParts: string[]): void {
  whereParts.push(`s.ata IS NOT NULL`);
  whereParts.push(`(
    (
      UPPER(TRIM(COALESCE(s.shipment_method, ''))) = 'SEA'
      AND UPPER(TRIM(COALESCE(s.ship_by, ''))) IN ('FCL', 'LCL', 'BULK')
    )
    OR UPPER(TRIM(COALESCE(s.shipment_method, ''))) = 'AIR'
  )`);
}

function appendPostArrivalLeadDaysFilter(whereParts: string[]): void {
  whereParts.push(
    `(${POST_ARRIVAL_BDAY_INDEX("s.closed_at")} - ${POST_ARRIVAL_BDAY_INDEX("s.ata")}) >= 0`
  );
}

export interface FinancialSummaryResult {
  import_value_idr: number;
  bm_idr: number;
  ppn_idr: number;
  pph_idr: number;
  freight_idr: number;
  /** import_value_idr + bm_idr */
  nilai_pabean_idr: number;
  /** nilai_pabean_idr + ppn_idr + pph_idr + freight_idr */
  total_idr: number;
}

/** One row returned by getLogisticsRows — one entry per shipment, expanded for FCL container types. */
export type LogisticsDetailSourceRow =
  | { transportMode: "AIR"; ptPlant: string; itemDescription: string; shipmentCount: number; forwarder: string }
  | { transportMode: "LCL"; ptPlant: string; itemDescription: string; packages: number; packageKind: string; cbm: number | null; forwarder: string }
  | { transportMode: "FCL"; fclSubType: string; ptPlant: string; itemDescription: string; containerCount: number; containerSpec: string; forwarder: string }
  | { transportMode: "BULK"; ptPlant: string; itemDescription: string; volumeMt: number | null; cbm: number | null; forwarder: string };

/** One row returned by getPostArrivalLead. When is_type_total=true, plant is null (load-type aggregate). */
export interface PostArrivalLeadRow {
  load_type: string;
  plant: string | null;
  avg_days: number;
  shipment_count: number;
  /** True = this row is the FCL/LCL total; false = per-plant detail row. */
  is_type_total: boolean;
}

export interface PostArrivalLeadShipmentsQuery extends ShipmentAnalyticsQuery {
  load_type: string;
  /** Raw plant key from aggregate row (PT – Plant concat). */
  group_pt_plant: string;
}

/** One shipment for post-arrival lead expand (load type + plant group). */
export interface PostArrivalLeadShipmentRow {
  id: string;
  shipment_number: string;
  current_status: string;
  lead_days: number;
  ata: string | null;
  closed_at: string | null;
}

/** Aggregated PO lines for analytics drill (Import by plant / By classification). */
export interface ShipmentAnalyticsLinesQuery extends ShipmentAnalyticsQuery {
  detail_kind: "plant" | "classification";
  /** From UI drill: omit or `__ALL__` = all; `(Unassigned)` = first PO has no plant. */
  detail_plant?: string;
  /** From UI drill: omit or `__ALL__` = all; `(Unassigned)` = shipment has no classification. */
  detail_classification?: string;
}

export interface ShipmentAnalyticsLineAggRow {
  item_description: string;
  pt: string | null;
  plant: string | null;
  /** Representative unit from PO line items (MAX when multiple receipts share the group). */
  unit: string | null;
  total_qty_delivered: number;
  total_price_idr: number;
}

export interface ShipmentAnalyticsLinesResult {
  /** Delivered shipments in scope (matches summary card counts). */
  shipment_count: number;
  rows: ShipmentAnalyticsLineAggRow[];
}

export interface ShipmentAnalyticsLineGroupShipmentsQuery extends ShipmentAnalyticsLinesQuery {
  group_item_description: string;
  group_pt?: string;
  group_plant?: string;
}

/** Whole shipments for an aggregated line group (expand/collapse drill). */
export interface ShipmentAnalyticsGroupShipmentRow {
  id: string;
  shipment_number: string;
  current_status: string;
  group_qty_delivered: number;
  group_amount_idr: number;
}

export type LogisticsTransportMode = "AIR" | "LCL" | "FCL" | "BULK";

export interface LogisticsGroupShipmentsQuery extends ShipmentAnalyticsQuery {
  group_pt_plant: string;
  group_item_description: string;
  transport_mode: LogisticsTransportMode;
  fcl_sub_type?: string;
}

function appendLineGroupKeyFilter(
  whereParts: string[],
  params: unknown[],
  group: { item_description: string; pt?: string; plant?: string }
): void {
  let idx = params.length + 1;
  const desc = group.item_description.trim();
  if (desc === "(No description)" || desc === "") {
    whereParts.push(
      `(CASE WHEN enriched.merged_desc = '' THEN '__EMPTY_DESC__' ELSE LOWER(enriched.merged_desc) END) = '__EMPTY_DESC__'`
    );
  } else {
    whereParts.push(`LOWER(enriched.merged_desc) = LOWER($${idx++})`);
    params.push(desc);
  }

  const pt = group.pt?.trim() || null;
  if (pt) {
    whereParts.push(`LOWER(TRIM(COALESCE(enriched.line_pt, ''))) = LOWER($${idx++})`);
    params.push(pt);
  } else {
    whereParts.push(`enriched.line_pt IS NULL`);
  }

  const plant = group.plant?.trim() || null;
  if (plant) {
    whereParts.push(`LOWER(TRIM(COALESCE(enriched.line_plant, ''))) = LOWER($${idx++})`);
    params.push(plant);
  } else {
    whereParts.push(`enriched.line_plant IS NULL`);
  }
}

function appendAnalyticsDetailDrill(
  whereParts: string[],
  params: unknown[],
  q: ShipmentAnalyticsLinesQuery
): void {
  let idx = params.length + 1;
  if (q.detail_kind === "plant") {
    const p = q.detail_plant?.trim();
    if (p && p !== "__ALL__") {
      if (p === "(Unassigned)") {
        whereParts.push(`(fp.plant IS NULL OR TRIM(COALESCE(fp.plant, '')) = '')`);
      } else {
        whereParts.push(`LOWER(TRIM(COALESCE(fp.plant, ''))) = LOWER($${idx++})`);
        params.push(p);
      }
    }
  } else if (q.detail_kind === "classification") {
    const c = q.detail_classification?.trim();
    if (c && c !== "__ALL__") {
      if (c === "(Unassigned)") {
        whereParts.push(`TRIM(COALESCE(s.product_classification, '')) = ''`);
      } else {
        whereParts.push(`${classificationCanonSql("s.product_classification")} = $${idx++}`);
        params.push(c);
      }
    }
  }
}

export interface ClassificationQtyRow {
  /** Canonical classification label: "Chemical" | "Package" | "Spare Parts" */
  classification: string;
  /** Total qty after unit conversion to the canonical display unit. */
  total_qty: number;
  /** Display unit label: "MT" | "set" | "pcs" */
  unit: string;
}

/** Canonical unit label per classification (used both for SQL CASE and response label). */
const CLASSIFICATION_UNIT: Record<string, string> = {
  Chemical: "MT",
  Package: "pcs",
  "Spare Parts": "unit",
};

function classificationCanonSql(columnRef: string): string {
  return `CASE TRIM(COALESCE(${columnRef}, ''))
      WHEN 'Chemical'    THEN 'Chemical'
      WHEN 'Checmical'   THEN 'Chemical'
      WHEN 'Package'     THEN 'Package'
      WHEN 'Packaging'   THEN 'Package'
      WHEN 'Spare Parts' THEN 'Spare Parts'
      WHEN 'Sparepart'   THEN 'Spare Parts'
      WHEN 'Spare part'  THEN 'Spare Parts'
      WHEN 'Spare parts' THEN 'Spare Parts'
      WHEN 'Spareparts'  THEN 'Spare Parts'
      ELSE NULL
    END`;
}

const CLASSIFICATION_CANON_SQL = classificationCanonSql("s.product_classification");

export class ShipmentAnalyticsRepository {
  private get pool(): Pool {
    return getPool();
  }

  async getSummary(q: ShipmentAnalyticsQuery): Promise<ShipmentAnalyticsSummary> {
    const { whereParts, params } = buildBaseWhereParams(q);
    const whereSql = whereParts.join(" AND ");

    const classificationNormSql = classificationCanonSql("product_classification");

    const fclRegistryColumns = FCL_CONTAINER_REGISTRY.map((t) => `s.${t.column}`).join(",\n          ");

    const baseCte = `
      WITH ${FIRST_PO_CTE},
      base AS (
        SELECT
          s.id,
          s.shipment_method,
          s.product_classification,
          s.vendor_name,
          s.ship_by,
          s.package_count,
          s.cbm,
          ${fclRegistryColumns},
          s.current_status,
          fp.plant AS display_plant,
          fp.pt AS display_pt
        FROM shipments s
        LEFT JOIN first_po fp ON fp.shipment_id = s.id
        WHERE ${whereSql}
      )
    `;

    const [totalRes, unclassRes, plantRes, classRes, logRes, seaByRes, lclSumRes, lclCbmSumRes, fclSumRes, bulkCargoRes, vendorsRes] =
      await Promise.all([
        this.pool.query<{ c: string }>(`${baseCte} SELECT COUNT(*)::text AS c FROM base`, params),
        this.pool.query<{ c: string }>(
          `${baseCte} SELECT COUNT(*)::text AS c FROM base WHERE TRIM(COALESCE(product_classification, '')) = ''`,
          params
        ),
        this.pool.query<{ plant: string; count: string }>(
          `${baseCte}
        SELECT COALESCE(NULLIF(TRIM(display_plant), ''), '(Unassigned)') AS plant, COUNT(*)::text AS count
        FROM base
        GROUP BY 1
        ORDER BY COUNT(*) DESC, plant ASC`,
          params
        ),
        this.pool.query<{ classification: string; count: string }>(
          `${baseCte}
        SELECT classification_norm AS classification, COUNT(*)::text AS count
        FROM (
          SELECT ${classificationNormSql} AS classification_norm
          FROM base
        ) x
        WHERE classification_norm IS NOT NULL
        GROUP BY 1
        ORDER BY COUNT(*) DESC, classification ASC`,
          params
        ),
        this.pool.query<{ air: string; sea: string }>(
          `${baseCte}
        SELECT
          COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(shipment_method, ''))) = 'AIR')::text AS air,
          COUNT(*) FILTER (WHERE UPPER(TRIM(COALESCE(shipment_method, ''))) = 'SEA')::text AS sea
        FROM base`,
          params
        ),
        this.pool.query<{ mode: string; count: string }>(
          `${baseCte}
        SELECT COALESCE(NULLIF(UPPER(TRIM(COALESCE(ship_by, ''))), ''), 'OTHER') AS mode, COUNT(*)::text AS count
        FROM base
        WHERE UPPER(TRIM(COALESCE(shipment_method, ''))) = 'SEA'
        GROUP BY 1
        ORDER BY COUNT(*) DESC, mode ASC`,
          params
        ),
        this.pool.query<{ s: string }>(
          `${baseCte}
        SELECT COALESCE(SUM(package_count), 0)::text AS s
        FROM base
        WHERE UPPER(TRIM(COALESCE(shipment_method, ''))) = 'SEA'
          AND UPPER(TRIM(COALESCE(ship_by, ''))) = 'LCL'`,
          params
        ),
        this.pool.query<{ s: string }>(
          `${baseCte}
        SELECT COALESCE(SUM(cbm), 0)::text AS s
        FROM base
        WHERE UPPER(TRIM(COALESCE(shipment_method, ''))) = 'SEA'
          AND UPPER(TRIM(COALESCE(ship_by, ''))) = 'LCL'`,
          params
        ),
        this.pool.query<Record<string, string>>(
          `${baseCte}
        SELECT
          ${FCL_CONTAINER_REGISTRY.map((t) => `COALESCE(SUM(${t.column}), 0)::text AS "${t.slug}"`).join(",\n          ")},
          ${FCL_CONTAINER_REGISTRY.map((t) => `COUNT(*) FILTER (WHERE COALESCE(${t.column}, 0) > 0)::text AS "${t.slug}_shipments"`).join(",\n          ")}
        FROM base
        WHERE UPPER(TRIM(COALESCE(shipment_method, ''))) = 'SEA'
          AND UPPER(TRIM(COALESCE(ship_by, ''))) = 'FCL'`,
          params
        ),
        this.pool.query<{ item_description: string; shipment_count: string }>(
          `${baseCte},
        ${FIRST_DESC_CTE}
        SELECT
          COALESCE(fd.item_description, '(No description)') AS item_description,
          COUNT(*)::text AS shipment_count
        FROM base b
        LEFT JOIN first_desc fd ON fd.shipment_id = b.id
        WHERE UPPER(TRIM(COALESCE(b.shipment_method, ''))) = 'SEA'
          AND UPPER(TRIM(COALESCE(b.ship_by, ''))) = 'BULK'
        GROUP BY COALESCE(fd.item_description, '(No description)')
        ORDER BY COUNT(*) DESC, item_description ASC`,
          params
        ),
        this.pool.query<{ v: string }>(
          `SELECT DISTINCT TRIM(s.vendor_name) AS v
           FROM shipments s
           WHERE s.deleted_at IS NULL
             AND (s.created_at AT TIME ZONE 'UTC')::date >= $1::date
             AND (s.created_at AT TIME ZONE 'UTC')::date <= $2::date
             AND TRIM(COALESCE(s.vendor_name, '')) <> ''
           ORDER BY 1
           LIMIT 500`,
          [q.date_from, q.date_to]
        ),
      ]);

    const log = logRes.rows[0];
    const fclRow = fclSumRes.rows[0] ?? {};
    const fclContainers = FCL_CONTAINER_REGISTRY
      .map((t) => ({
        slug: t.slug,
        label: t.label,
        count: parseInt(fclRow[t.slug] ?? "0", 10),
        shipment_count: parseInt(fclRow[`${t.slug}_shipments`] ?? "0", 10),
      }))
      .filter((t) => t.count > 0);

    const bulkCargo = bulkCargoRes.rows.map((r) => ({
      item_description: r.item_description,
      shipment_count: parseInt(r.shipment_count, 10),
    }));

    return {
      total_shipments: parseInt(totalRes.rows[0]?.c ?? "0", 10),
      unclassified_shipments: parseInt(unclassRes.rows[0]?.c ?? "0", 10),
      by_plant: plantRes.rows.map((r) => ({ plant: r.plant, count: parseInt(r.count, 10) })),
      by_classification: classRes.rows.map((r) => ({
        classification: r.classification,
        count: parseInt(r.count, 10),
      })),
      logistics: {
        air: parseInt(log?.air ?? "0", 10),
        sea: parseInt(log?.sea ?? "0", 10),
      },
      sea_logistics: {
        by_ship_by: seaByRes.rows.map((r) => ({ ship_by: r.mode, count: parseInt(r.count, 10) })),
        lcl_package_count_total: parseInt(lclSumRes.rows[0]?.s ?? "0", 10),
        lcl_cbm_total: parseFloat(lclCbmSumRes.rows[0]?.s ?? "0"),
        fcl_containers: fclContainers,
        bulk_cargo: bulkCargo,
      },
      vendor_options: vendorsRes.rows.map((r) => r.v).filter(Boolean),
    };
  }

  /**
   * Σ received qty and line value (IDR) per normalized item description + PO plant + PT
   * for shipments in the analytics scope (same filters / first-PO plant logic as summary).
   */
  async getLineAggregation(q: ShipmentAnalyticsLinesQuery): Promise<ShipmentAnalyticsLinesResult> {
    const base = buildBaseWhereParams(q);
    const whereParts = [...base.whereParts];
    const params = [...base.params];
    appendAnalyticsDetailDrill(whereParts, params, q);
    const whereSql = whereParts.join(" AND ");

    const scopeCte = `
      WITH ${FIRST_PO_CTE},
      shipments_in_scope AS (
        SELECT s.id
        FROM shipments s
        LEFT JOIN first_po fp ON fp.shipment_id = s.id
        WHERE ${whereSql}
      )`;

    const countSql = `${scopeCte} SELECT COUNT(*)::text AS c FROM shipments_in_scope`;

    const sql = `
      ${scopeCte},
      enriched AS (
        SELECT
          TRIM(BOTH FROM COALESCE(
            NULLIF(TRIM(BOTH FROM COALESCE(r.item_description, '')), ''),
            NULLIF(TRIM(BOTH FROM COALESCE(it.item_description, '')), '')
          )) AS merged_desc,
          NULLIF(TRIM(BOTH FROM COALESCE(fp.plant, '')), '') AS line_plant,
          NULLIF(TRIM(BOTH FROM COALESCE(fp.pt, '')), '') AS line_pt,
          NULLIF(TRIM(BOTH FROM COALESCE(it.unit, '')), '') AS line_unit,
          COALESCE(r.received_qty, 0)::numeric AS qty,
          (COALESCE(r.received_qty, 0)::numeric * COALESCE(it.unit_price, 0)::numeric * CASE
            WHEN UPPER(TRIM(COALESCE(i.currency, ''))) IN ('IDR', 'RP') THEN 1::numeric
            ELSE COALESCE(NULLIF(m.currency_rate, 0), 1)::numeric
          END) AS amount_idr
        FROM shipments_in_scope sis
        LEFT JOIN first_po fp ON fp.shipment_id = sis.id
        INNER JOIN shipment_po_mapping m
          ON m.shipment_id = sis.id AND m.decoupled_at IS NULL
        INNER JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id AND r.deleted_at IS NULL
        INNER JOIN Import_purchase_order_items it
          ON it.id = r.item_id AND it.import_purchase_order_id = r.intake_id
        INNER JOIN Import_purchase_order i ON i.id = r.intake_id
      )
      SELECT
        COALESCE(MAX(NULLIF(enriched.merged_desc, '')), '(No description)') AS item_description,
        enriched.line_pt AS pt,
        enriched.line_plant AS plant,
        MAX(enriched.line_unit) AS unit,
        COALESCE(SUM(enriched.qty), 0)::text AS total_qty_delivered,
        COALESCE(SUM(enriched.amount_idr), 0)::text AS total_price_idr
      FROM enriched
      GROUP BY
        CASE WHEN enriched.merged_desc = '' THEN '__EMPTY_DESC__' ELSE LOWER(enriched.merged_desc) END,
        enriched.line_plant,
        enriched.line_pt
      ORDER BY COALESCE(SUM(enriched.amount_idr), 0) DESC NULLS LAST,
        COALESCE(MAX(NULLIF(enriched.merged_desc, '')), '(No description)') ASC,
        enriched.line_pt ASC NULLS LAST,
        enriched.line_plant ASC NULLS LAST
      LIMIT 3000
    `;

    const [countRes, result] = await Promise.all([
      this.pool.query<{ c: string }>(countSql, params),
      this.pool.query<{
        item_description: string;
        pt: string | null;
        plant: string | null;
        unit: string | null;
        total_qty_delivered: string;
        total_price_idr: string;
      }>(sql, params),
    ]);

    return {
      shipment_count: parseInt(countRes.rows[0]?.c ?? "0", 10),
      rows: result.rows.map((row) => ({
        item_description: row.item_description,
        pt: row.pt,
        plant: row.plant,
        unit: row.unit?.trim() ? row.unit.trim() : null,
        total_qty_delivered: parseFloat(row.total_qty_delivered),
        total_price_idr: parseFloat(row.total_price_idr),
      })),
    };
  }

  /**
   * Total received qty per canonical classification for DELIVERED shipments in scope.
   * Qty is converted to the canonical display unit (Chemical→MT, Package→set, Spare Parts→pcs).
   * Line items with unrecognised units are excluded from the sum.
   */
  async getClassificationQty(q: ShipmentAnalyticsQuery): Promise<ClassificationQtyRow[]> {
    const { whereParts, params } = buildBaseWhereParams(q);
    const whereSql = whereParts.join(" AND ");

    const sql = `
      WITH ${FIRST_PO_CTE},
      base AS (
        SELECT
          s.id,
          ${CLASSIFICATION_CANON_SQL} AS classification_canon
        FROM shipments s
        LEFT JOIN first_po fp ON fp.shipment_id = s.id
        WHERE ${whereSql}
      ),
      qty_rows AS (
        SELECT
          b.classification_canon,
          CASE b.classification_canon
            WHEN 'Chemical' THEN
              -- Unit conversion required: all values normalised to MT
              CASE UPPER(TRIM(COALESCE(it.unit, '')))
                WHEN 'MT'  THEN COALESCE(r.received_qty, 0)::numeric
                WHEN 'TNE' THEN COALESCE(r.received_qty, 0)::numeric
                WHEN 'KG'  THEN COALESCE(r.received_qty, 0)::numeric / 1000.0
                WHEN 'KGS' THEN COALESCE(r.received_qty, 0)::numeric / 1000.0
                WHEN 'KGM' THEN COALESCE(r.received_qty, 0)::numeric / 1000.0
                ELSE NULL
              END
            WHEN 'Package' THEN
              -- No unit conversion: sum all received qty regardless of unit, displayed as pcs
              COALESCE(r.received_qty, 0)::numeric
            WHEN 'Spare Parts' THEN
              -- No unit conversion: sum all received qty regardless of unit, displayed as unit
              COALESCE(r.received_qty, 0)::numeric
            ELSE NULL
          END AS qty_converted
        FROM base b
        JOIN shipment_po_mapping m ON m.shipment_id = b.id AND m.decoupled_at IS NULL
        JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id AND r.deleted_at IS NULL
        JOIN Import_purchase_order_items it
          ON it.id = r.item_id AND it.import_purchase_order_id = r.intake_id
        WHERE b.classification_canon IS NOT NULL
      )
      SELECT
        classification_canon AS classification,
        COALESCE(SUM(qty_converted), 0)::text AS total_qty
      FROM qty_rows
      WHERE qty_converted IS NOT NULL
      GROUP BY classification_canon
      ORDER BY classification_canon
    `;

    const result = await this.pool.query<{ classification: string; total_qty: string }>(sql, params);

    return result.rows.map((row) => ({
      classification: row.classification,
      total_qty: parseFloat(row.total_qty),
      unit: CLASSIFICATION_UNIT[row.classification] ?? "",
    }));
  }

  /**
   * Returns one row per delivered shipment with transport-mode-specific fields, suitable
   * for the LogisticsDetailTable on the dashboard. Items are enriched with the primary PO
   * line's item_description using the same first_po CTE pattern.
   */
  async getLogisticsRows(q: ShipmentAnalyticsQuery): Promise<LogisticsDetailSourceRow[]> {
    const { whereParts, params } = buildBaseWhereParams(q);
    const whereSql = whereParts.join(" AND ");

    const fclSelectCols = FCL_CONTAINER_REGISTRY
      .map((t) => `COALESCE(s.${t.column}, 0) AS "${t.slug}"`)
      .join(",\n        ");

    const sql = `
      WITH ${FIRST_PO_CTE},
      first_desc AS (
        SELECT DISTINCT ON (m.shipment_id)
          m.shipment_id,
          TRIM(COALESCE(
            NULLIF(TRIM(COALESCE(r.item_description, '')), ''),
            NULLIF(TRIM(COALESCE(it.item_description, '')), ''),
            '(No description)'
          )) AS item_description
        FROM shipment_po_mapping m
        JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
        JOIN Import_purchase_order_items it ON it.import_purchase_order_id = i.id
        LEFT JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id
          AND r.item_id = it.id AND r.deleted_at IS NULL
        ORDER BY m.shipment_id, i.po_number ASC NULLS LAST, it.id ASC
      )
      SELECT
        UPPER(TRIM(COALESCE(s.shipment_method, ''))) AS transport_mode,
        UPPER(TRIM(COALESCE(s.ship_by, ''))) AS ship_by,
        CONCAT(COALESCE(NULLIF(TRIM(fp.pt), ''), '—'), ' – ', COALESCE(NULLIF(TRIM(fp.plant), ''), '—')) AS pt_plant,
        COALESCE(fd.item_description, '(No description)') AS item_description,
        COALESCE(NULLIF(TRIM(s.forwarder_name), ''), '—') AS forwarder,
        COALESCE(s.package_count, 0) AS package_count,
        ${fclSelectCols},
        COALESCE(s.net_weight_mt, 0) AS net_weight_mt,
        COALESCE(s.cbm, 0) AS cbm
      FROM shipments s
      LEFT JOIN first_po fp ON fp.shipment_id = s.id
      LEFT JOIN first_desc fd ON fd.shipment_id = s.id
      WHERE ${whereSql}
      ORDER BY transport_mode, ship_by, pt_plant
      LIMIT 5000
    `;

    type RawRow = {
      transport_mode: string;
      ship_by: string;
      pt_plant: string;
      item_description: string;
      forwarder: string;
      package_count: string;
      net_weight_mt: string;
      cbm: string;
    } & Record<string, string>;

    const result = await this.pool.query<RawRow>(sql, params);

    return result.rows.flatMap((row): LogisticsDetailSourceRow[] => {
      const mode = row.transport_mode;
      const shipBy = row.ship_by;
      const ptPlant = row.pt_plant;
      const itemDescription = row.item_description;
      const forwarder = row.forwarder;

      if (mode === "AIR") {
        return [{ transportMode: "AIR", ptPlant, itemDescription, shipmentCount: 1, forwarder }];
      }
      if (mode === "SEA") {
        if (shipBy === "LCL") {
          return [{
            transportMode: "LCL",
            ptPlant,
            itemDescription,
            packages: Number(row.package_count),
            packageKind: "packages",
            cbm: Number(row.cbm) || null,
            forwarder,
          }];
        }
        if (shipBy === "FCL") {
          const fclRows: LogisticsDetailSourceRow[] = [];
          for (const containerType of FCL_CONTAINER_REGISTRY) {
            const count = Number(row[containerType.slug]);
            if (count > 0) {
              fclRows.push({
                transportMode: "FCL",
                fclSubType: containerType.slug,
                ptPlant,
                itemDescription,
                containerCount: count,
                containerSpec: containerType.label,
                forwarder,
              });
            }
          }
          if (fclRows.length === 0) {
            const firstType = FCL_CONTAINER_REGISTRY[0];
            fclRows.push({
              transportMode: "FCL",
              fclSubType: firstType.slug,
              ptPlant,
              itemDescription,
              containerCount: 0,
              containerSpec: firstType.label,
              forwarder,
            });
          }
          return fclRows;
        }
        if (shipBy === "BULK") {
          return [{
            transportMode: "BULK",
            ptPlant,
            itemDescription,
            volumeMt: Number(row.net_weight_mt) || null,
            cbm: Number(row.cbm) || null,
            forwarder,
          }];
        }
      }
      return [];
    });
  }

  /**
   * Post-Arrival Lead Time by ship_by (FCL/LCL) and plant, for SEA DELIVERED shipments.
   *
   * Business-day formula uses a reference Monday (2000-01-03) to convert each date to a
   * "business-day index", then subtracts. This correctly excludes Saturdays and Sundays.
   * Post-arrival lead time: business days from ATA to delivery (closed_at).
   *
   * Scope:
   * - SEA + FCL/LCL (load_type = ship_by)
   * - AIR (load_type = AIR)
   *
   * Formula:
   *   bday_index(d) = FLOOR((d - '2000-01-03') / 7) * 5 + LEAST(EXTRACT(ISODOW FROM d), 5)
   *   business_days(ata, closed_at) = bday_index(closed_at) - bday_index(ata)
   *
   * Uses GROUPING SETS so both the load-type totals and per-plant detail are returned in
   * one query. Rows where is_type_total = 1 are the aggregate; = 0 are per-plant.
   */
  async getPostArrivalLead(q: ShipmentAnalyticsQuery): Promise<PostArrivalLeadRow[]> {
    const { whereParts, params } = buildBaseWhereParams(q);
    appendPostArrivalScopeFilters(whereParts);
    appendPostArrivalLeadDaysFilter(whereParts);
    const whereSql = whereParts.join(" AND ");

    const sql = `
      WITH ${FIRST_PO_CTE},
      base AS (
        SELECT
          ${POST_ARRIVAL_LOAD_TYPE_EXPR} AS load_type,
          ${POST_ARRIVAL_PLANT_EXPR} AS plant,
          ${POST_ARRIVAL_BDAY_INDEX("s.closed_at")} - ${POST_ARRIVAL_BDAY_INDEX("s.ata")} AS bdays
        FROM shipments s
        LEFT JOIN first_po fp ON fp.shipment_id = s.id
        WHERE ${whereSql}
      )
      SELECT
        load_type,
        plant,
        ROUND(AVG(bdays)::numeric, 1) AS avg_days,
        COUNT(*)::int AS shipment_count,
        GROUPING(plant)::int AS is_type_total
      FROM base
      GROUP BY GROUPING SETS ((load_type), (load_type, plant))
      ORDER BY load_type, is_type_total DESC, avg_days DESC
    `;

    const result = await this.pool.query<{
      load_type: string;
      plant: string | null;
      avg_days: string;
      shipment_count: number;
      is_type_total: number;
    }>(sql, params);

    return result.rows.map((row) => ({
      load_type: row.load_type,
      plant: row.plant ?? null,
      avg_days: parseFloat(row.avg_days),
      shipment_count: Number(row.shipment_count),
      is_type_total: row.is_type_total === 1,
    }));
  }

  /** Whole delivered shipments for a post-arrival lead plant group (expand drill). */
  async getPostArrivalLeadShipments(q: PostArrivalLeadShipmentsQuery): Promise<PostArrivalLeadShipmentRow[]> {
    const { whereParts, params } = buildBaseWhereParams(q);
    appendPostArrivalScopeFilters(whereParts);
    appendPostArrivalLeadDaysFilter(whereParts);
    const scopeWhereSql = whereParts.join(" AND ");

    let idx = params.length + 1;
    const loadType = q.load_type.trim().toUpperCase();
    const groupPtPlant = q.group_pt_plant.trim();

    const sql = `
      WITH ${FIRST_PO_CTE},
      base AS (
        SELECT
          s.id AS shipment_id,
          s.shipment_no AS shipment_number,
          COALESCE(s.current_status, '') AS current_status,
          ${POST_ARRIVAL_LOAD_TYPE_EXPR} AS load_type,
          ${POST_ARRIVAL_PLANT_EXPR} AS plant,
          (${POST_ARRIVAL_BDAY_INDEX("s.closed_at")} - ${POST_ARRIVAL_BDAY_INDEX("s.ata")})::int AS lead_days,
          s.ata,
          s.closed_at
        FROM shipments s
        LEFT JOIN first_po fp ON fp.shipment_id = s.id
        WHERE ${scopeWhereSql}
      )
      SELECT
        shipment_id::text AS id,
        shipment_number,
        current_status,
        lead_days::text AS lead_days,
        ata::text AS ata,
        closed_at::text AS closed_at
      FROM base
      WHERE load_type = $${idx++}
        AND plant = $${idx++}
      ORDER BY shipment_number ASC
      LIMIT 500
    `;

    params.push(loadType, groupPtPlant);

    const result = await this.pool.query<{
      id: string;
      shipment_number: string;
      current_status: string;
      lead_days: string;
      ata: string | null;
      closed_at: string | null;
    }>(sql, params);

    return result.rows.map((row) => ({
      id: row.id,
      shipment_number: row.shipment_number,
      current_status: row.current_status,
      lead_days: parseInt(row.lead_days, 10),
      ata: row.ata,
      closed_at: row.closed_at,
    }));
  }

  /**
   * Aggregated financial summary for DELIVERED shipments in the analytics date range.
   *
   * - import_value_idr: Σ(PO line qty × unit_price in IDR) via shipment_po_mapping
   * - bm_idr / ppn_idr / pph_idr: direct columns on shipments
   * - freight_idr: incoterm_amount converted to IDR (USD × idrPerUsd)
   * - bm_idr: Σ shipments.bm (Biaya Masuk / BM amount)
   * - nilai_pabean_idr: import_value_idr + bm_idr (used for total only)
   * - total_idr: import_value_idr + bm_idr + ppn_idr + pph_idr + freight_idr
   */
  async getFinancialSummary(q: ShipmentAnalyticsQuery, idrPerUsd: number): Promise<FinancialSummaryResult> {
    const { whereParts, params } = buildBaseWhereParams(q);
    const whereSql = whereParts.join(" AND ");
    params.push(idrPerUsd);
    const idrIdx = params.length;

    const sql = `
      WITH ${FIRST_PO_CTE},
      po_amounts AS (
        SELECT
          m.shipment_id,
          SUM(
            COALESCE(r.received_qty, 0)::numeric *
            COALESCE(it.unit_price, 0)::numeric *
            CASE
              WHEN UPPER(TRIM(COALESCE(po.currency, ''))) IN ('IDR', 'RP') THEN 1::numeric
              ELSE COALESCE(NULLIF(m.currency_rate::numeric, 0), 1::numeric)
            END
          ) AS import_value_idr
        FROM shipment_po_mapping m
        JOIN Import_purchase_order po ON po.id = m.intake_id AND m.decoupled_at IS NULL
        JOIN Import_purchase_order_items it ON it.import_purchase_order_id = po.id
        JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id
          AND r.intake_id = m.intake_id
          AND r.item_id = it.id
          AND r.deleted_at IS NULL
        GROUP BY m.shipment_id
      )
      SELECT
        COALESCE(SUM(COALESCE(pa.import_value_idr, 0)), 0)::text AS import_value_idr,
        COALESCE(SUM(COALESCE(s.bm, 0)), 0)::text AS bm_idr,
        COALESCE(SUM(COALESCE(s.ppn_amount, 0)), 0)::text AS ppn_idr,
        COALESCE(SUM(COALESCE(s.pph_amount, 0)), 0)::text AS pph_idr,
        COALESCE(SUM(
          CASE
            WHEN UPPER(TRIM(COALESCE(s.incoterm_currency, ''))) = 'USD'
              THEN COALESCE(s.incoterm_amount, 0)::numeric * $${idrIdx}::numeric
            ELSE COALESCE(s.incoterm_amount, 0)::numeric
          END
        ), 0)::text AS freight_idr
      FROM shipments s
      LEFT JOIN first_po fp ON fp.shipment_id = s.id
      LEFT JOIN po_amounts pa ON pa.shipment_id = s.id
      WHERE ${whereSql}
    `;

    const result = await this.pool.query<{
      import_value_idr: string;
      bm_idr: string;
      ppn_idr: string;
      pph_idr: string;
      freight_idr: string;
    }>(sql, params);

    const row = result.rows[0];
    const importValue = parseFloat(row?.import_value_idr ?? "0");
    const bm = parseFloat(row?.bm_idr ?? "0");
    const ppn = parseFloat(row?.ppn_idr ?? "0");
    const pph = parseFloat(row?.pph_idr ?? "0");
    const freight = parseFloat(row?.freight_idr ?? "0");
    const nilaiPabean = importValue + bm;
    return {
      import_value_idr: importValue,
      bm_idr: bm,
      ppn_idr: ppn,
      pph_idr: pph,
      freight_idr: freight,
      nilai_pabean_idr: nilaiPabean,
      total_idr: nilaiPabean + ppn + pph + freight,
    };
  }

  /**
   * Whole delivered shipments for a plant/classification aggregated line group.
   * One row per shipment with matching received lines; link opens full shipment detail.
   */
  async getLineGroupShipments(
    q: ShipmentAnalyticsLineGroupShipmentsQuery
  ): Promise<ShipmentAnalyticsGroupShipmentRow[]> {
    const base = buildBaseWhereParams(q);
    const whereParts = [...base.whereParts];
    const params = [...base.params];
    appendAnalyticsDetailDrill(whereParts, params, q);
    const scopeWhereSql = whereParts.join(" AND ");

    const groupWhereParts: string[] = [];
    appendLineGroupKeyFilter(groupWhereParts, params, {
      item_description: q.group_item_description,
      pt: q.group_pt,
      plant: q.group_plant,
    });
    const groupWhereSql = groupWhereParts.join(" AND ");

    const scopeCte = `
      WITH ${FIRST_PO_CTE},
      shipments_in_scope AS (
        SELECT s.id
        FROM shipments s
        LEFT JOIN first_po fp ON fp.shipment_id = s.id
        WHERE ${scopeWhereSql}
      )`;

    const sql = `
      ${scopeCte},
      enriched AS (
        SELECT
          sis.id AS shipment_id,
          TRIM(BOTH FROM COALESCE(
            NULLIF(TRIM(BOTH FROM COALESCE(r.item_description, '')), ''),
            NULLIF(TRIM(BOTH FROM COALESCE(it.item_description, '')), '')
          )) AS merged_desc,
          NULLIF(TRIM(BOTH FROM COALESCE(fp.plant, '')), '') AS line_plant,
          NULLIF(TRIM(BOTH FROM COALESCE(fp.pt, '')), '') AS line_pt,
          COALESCE(r.received_qty, 0)::numeric AS qty,
          (COALESCE(r.received_qty, 0)::numeric * COALESCE(it.unit_price, 0)::numeric * CASE
            WHEN UPPER(TRIM(COALESCE(i.currency, ''))) IN ('IDR', 'RP') THEN 1::numeric
            ELSE COALESCE(NULLIF(m.currency_rate, 0), 1)::numeric
          END) AS amount_idr
        FROM shipments_in_scope sis
        LEFT JOIN first_po fp ON fp.shipment_id = sis.id
        INNER JOIN shipment_po_mapping m
          ON m.shipment_id = sis.id AND m.decoupled_at IS NULL
        INNER JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id AND r.deleted_at IS NULL
        INNER JOIN Import_purchase_order_items it
          ON it.id = r.item_id AND it.import_purchase_order_id = r.intake_id
        INNER JOIN Import_purchase_order i ON i.id = r.intake_id
      )
      SELECT
        s.id::text AS id,
        s.shipment_no AS shipment_number,
        COALESCE(s.current_status, '') AS current_status,
        COALESCE(SUM(enriched.qty), 0)::text AS group_qty_delivered,
        COALESCE(SUM(enriched.amount_idr), 0)::text AS group_amount_idr
      FROM enriched
      INNER JOIN shipments s ON s.id = enriched.shipment_id AND s.deleted_at IS NULL
      WHERE ${groupWhereSql}
      GROUP BY s.id, s.shipment_no, s.current_status
      ORDER BY s.shipment_no ASC
      LIMIT 500
    `;

    const result = await this.pool.query<{
      id: string;
      shipment_number: string;
      current_status: string;
      group_qty_delivered: string;
      group_amount_idr: string;
    }>(sql, params);

    return result.rows.map((row) => ({
      id: row.id,
      shipment_number: row.shipment_number,
      current_status: row.current_status,
      group_qty_delivered: parseFloat(row.group_qty_delivered),
      group_amount_idr: parseFloat(row.group_amount_idr),
    }));
  }

  /** Whole delivered shipments for a logistics detail group (expand/collapse). */
  async getLogisticsGroupShipments(q: LogisticsGroupShipmentsQuery): Promise<ShipmentAnalyticsGroupShipmentRow[]> {
    const { whereParts, params } = buildBaseWhereParams(q);
    const whereSql = whereParts.join(" AND ");

    let idx = params.length + 1;
    params.push(q.group_pt_plant.trim());
    const ptPlantParam = `$${idx++}`;
    params.push(q.group_item_description.trim());
    const itemParam = `$${idx++}`;

    const ptPlantSql = `CONCAT(COALESCE(NULLIF(TRIM(fp.pt), ''), '—'), ' – ', COALESCE(NULLIF(TRIM(fp.plant), ''), '—'))`;
    const itemSql = `COALESCE(fd.item_description, '(No description)')`;

    const transportFilters: string[] = [
      `${ptPlantSql} = ${ptPlantParam}`,
      `${itemSql} = ${itemParam}`,
    ];

    if (q.transport_mode === "AIR") {
      transportFilters.push(`UPPER(TRIM(COALESCE(s.shipment_method, ''))) = 'AIR'`);
    } else {
      transportFilters.push(`UPPER(TRIM(COALESCE(s.shipment_method, ''))) = 'SEA'`);
      if (q.transport_mode === "LCL") {
        transportFilters.push(`UPPER(TRIM(COALESCE(s.ship_by, ''))) = 'LCL'`);
      } else if (q.transport_mode === "FCL") {
        transportFilters.push(`UPPER(TRIM(COALESCE(s.ship_by, ''))) = 'FCL'`);
        const slug = q.fcl_sub_type?.trim();
        const containerType = slug
          ? FCL_CONTAINER_REGISTRY.find((t) => t.slug === slug)
          : FCL_CONTAINER_REGISTRY[0];
        if (containerType) {
          transportFilters.push(`COALESCE(s.${containerType.column}, 0) > 0`);
        }
      } else {
        transportFilters.push(`UPPER(TRIM(COALESCE(s.ship_by, ''))) = 'BULK'`);
      }
    }

    const sql = `
      WITH ${FIRST_PO_CTE},
      first_desc AS (
        SELECT DISTINCT ON (m.shipment_id)
          m.shipment_id,
          TRIM(COALESCE(
            NULLIF(TRIM(COALESCE(r.item_description, '')), ''),
            NULLIF(TRIM(COALESCE(it.item_description, '')), ''),
            '(No description)'
          )) AS item_description
        FROM shipment_po_mapping m
        JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
        JOIN Import_purchase_order_items it ON it.import_purchase_order_id = i.id
        LEFT JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id
          AND r.item_id = it.id AND r.deleted_at IS NULL
        ORDER BY m.shipment_id, i.po_number ASC NULLS LAST, it.id ASC
      )
      SELECT
        s.id::text AS id,
        s.shipment_no AS shipment_number,
        COALESCE(s.current_status, '') AS current_status,
        '0'::text AS group_qty_delivered,
        '0'::text AS group_amount_idr
      FROM shipments s
      LEFT JOIN first_po fp ON fp.shipment_id = s.id
      LEFT JOIN first_desc fd ON fd.shipment_id = s.id
      WHERE ${whereSql}
        AND ${transportFilters.join(" AND ")}
      ORDER BY s.shipment_no ASC
      LIMIT 500
    `;

    const result = await this.pool.query<{
      id: string;
      shipment_number: string;
      current_status: string;
      group_qty_delivered: string;
      group_amount_idr: string;
    }>(sql, params);

    return result.rows.map((row) => ({
      id: row.id,
      shipment_number: row.shipment_number,
      current_status: row.current_status,
      group_qty_delivered: parseFloat(row.group_qty_delivered),
      group_amount_idr: parseFloat(row.group_amount_idr),
    }));
  }
}
