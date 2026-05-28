import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import { classificationFilterSqlVariants } from "../../../shared/product-classification.js";

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
  /** Count of shipments per `ship_by` (uppercased; blank → "OTHER"). */
  by_ship_by: { ship_by: string; count: number }[];
  /** Σ `package_count` on Sea + LCL rows (LCL quantity field on shipment). */
  lcl_package_count_total: number;
  /** Σ container fields on Sea + FCL rows. */
  fcl_container_totals: {
    container_20ft: number;
    container_40ft: number;
    iso_tank_20: number;
  };
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

function buildBaseWhereParams(q: ShipmentAnalyticsQuery): { whereParts: string[]; params: unknown[] } {
  const whereParts: string[] = [
    `(s.created_at AT TIME ZONE 'UTC')::date >= $1::date`,
    `(s.created_at AT TIME ZONE 'UTC')::date <= $2::date`,
    `s.deleted_at IS NULL`,
  ];
  const params: unknown[] = [q.date_from, q.date_to];
  let idx = 3;

  const pts = q.pts?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (pts.length === 1) {
    whereParts.push(`fp.pt = $${idx++}`);
    params.push(pts[0]);
  } else if (pts.length > 1) {
    whereParts.push(`fp.pt = ANY($${idx++}::text[])`);
    params.push(pts);
  }

  const plants = q.plants?.map((s) => s.trim()).filter(Boolean) ?? [];
  if (plants.length === 1) {
    whereParts.push(`fp.plant = $${idx++}`);
    params.push(plants[0]);
  } else if (plants.length > 1) {
    whereParts.push(`fp.plant = ANY($${idx++}::text[])`);
    params.push(plants);
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
        whereParts.push(`fp.plant = $${idx++}`);
        params.push(p);
      }
    }
  } else if (q.detail_kind === "classification") {
    const c = q.detail_classification?.trim();
    if (c && c !== "__ALL__") {
      if (c === "(Unassigned)") {
        whereParts.push(`TRIM(COALESCE(s.product_classification, '')) = ''`);
      } else {
        const variants = classificationFilterSqlVariants(c);
        if (variants.length === 1) {
          whereParts.push(`TRIM(COALESCE(s.product_classification, '')) = $${idx++}`);
          params.push(variants[0]);
        } else {
          whereParts.push(`TRIM(COALESCE(s.product_classification, '')) = ANY($${idx++}::text[])`);
          params.push(variants);
        }
      }
    }
  }
}

export class ShipmentAnalyticsRepository {
  private get pool(): Pool {
    return getPool();
  }

  async getSummary(q: ShipmentAnalyticsQuery): Promise<ShipmentAnalyticsSummary> {
    const { whereParts, params } = buildBaseWhereParams(q);
    const whereSql = whereParts.join(" AND ");

    const classificationNormSql = `(CASE TRIM(COALESCE(product_classification, ''))
        WHEN '' THEN NULL
        WHEN 'Checmical' THEN 'Chemical'
        WHEN 'Packaging' THEN 'Package'
        ELSE NULLIF(TRIM(COALESCE(product_classification, '')), '')
      END)`;

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
          s.container_count_20ft,
          s.container_count_40ft,
          s.container_count_20_iso_tank,
          fp.plant AS display_plant,
          fp.pt AS display_pt
        FROM shipments s
        LEFT JOIN first_po fp ON fp.shipment_id = s.id
        WHERE ${whereSql}
      )
    `;

    const [totalRes, unclassRes, plantRes, classRes, logRes, seaByRes, lclSumRes, fclSumRes, vendorsRes] =
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
        this.pool.query<{ c20: string; c40: string; ciso: string }>(
          `${baseCte}
        SELECT
          COALESCE(SUM(container_count_20ft), 0)::text AS c20,
          COALESCE(SUM(container_count_40ft), 0)::text AS c40,
          COALESCE(SUM(container_count_20_iso_tank), 0)::text AS ciso
        FROM base
        WHERE UPPER(TRIM(COALESCE(shipment_method, ''))) = 'SEA'
          AND UPPER(TRIM(COALESCE(ship_by, ''))) = 'FCL'`,
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
    const fcl = fclSumRes.rows[0];
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
        fcl_container_totals: {
          container_20ft: parseInt(fcl?.c20 ?? "0", 10),
          container_40ft: parseInt(fcl?.c40 ?? "0", 10),
          iso_tank_20: parseInt(fcl?.ciso ?? "0", 10),
        },
      },
      vendor_options: vendorsRes.rows.map((r) => r.v).filter(Boolean),
    };
  }

  /**
   * Σ received qty and line value (IDR) per normalized item description + PO plant + PT
   * for shipments in the analytics scope (same filters / first-PO plant logic as summary).
   */
  async getLineAggregation(q: ShipmentAnalyticsLinesQuery): Promise<ShipmentAnalyticsLineAggRow[]> {
    const base = buildBaseWhereParams(q);
    const whereParts = [...base.whereParts];
    const params = [...base.params];
    appendAnalyticsDetailDrill(whereParts, params, q);
    const whereSql = whereParts.join(" AND ");

    const sql = `
      WITH ${FIRST_PO_CTE},
      shipments_in_scope AS (
        SELECT s.id
        FROM shipments s
        LEFT JOIN first_po fp ON fp.shipment_id = s.id
        WHERE ${whereSql}
      ),
      enriched AS (
        SELECT
          TRIM(BOTH FROM COALESCE(
            NULLIF(TRIM(BOTH FROM COALESCE(r.item_description, '')), ''),
            NULLIF(TRIM(BOTH FROM COALESCE(it.item_description, '')), '')
          )) AS merged_desc,
          NULLIF(TRIM(BOTH FROM COALESCE(i.plant, '')), '') AS line_plant,
          NULLIF(TRIM(BOTH FROM COALESCE(i.pt, '')), '') AS line_pt,
          NULLIF(TRIM(BOTH FROM COALESCE(it.unit, '')), '') AS line_unit,
          COALESCE(r.received_qty, 0)::numeric AS qty,
          (COALESCE(r.received_qty, 0)::numeric * COALESCE(it.unit_price, 0)::numeric * CASE
            WHEN UPPER(TRIM(COALESCE(i.currency, ''))) IN ('IDR', 'RP') THEN 1::numeric
            ELSE COALESCE(NULLIF(m.currency_rate, 0), 1)::numeric
          END) AS amount_idr
        FROM shipments_in_scope sis
        INNER JOIN shipment_po_mapping m
          ON m.shipment_id = sis.id AND m.decoupled_at IS NULL
        INNER JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id
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

    const result = await this.pool.query<{
      item_description: string;
      pt: string | null;
      plant: string | null;
      unit: string | null;
      total_qty_delivered: string;
      total_price_idr: string;
    }>(sql, params);

    return result.rows.map((row) => ({
      item_description: row.item_description,
      pt: row.pt,
      plant: row.plant,
      unit: row.unit?.trim() ? row.unit.trim() : null,
      total_qty_delivered: parseFloat(row.total_qty_delivered),
      total_price_idr: parseFloat(row.total_price_idr),
    }));
  }
}
