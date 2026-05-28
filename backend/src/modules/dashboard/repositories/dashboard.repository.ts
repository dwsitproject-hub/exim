import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";

export interface DeliveredManagementQuery {
  month?: number;
  year?: number;
}

export interface DeliveredPtPlantAggQuery extends DeliveredManagementQuery {
  pt?: string;
  plant?: string;
}

export interface DeliveredPtPlantAggRow {
  pt: string | null;
  plant: string | null;
  total_amount_idr: number;
  total_qty: number;
}

export interface DeliveredClassificationAggQuery extends DeliveredManagementQuery {}

/** Internal bucket from SQL before service maps labels/units. */
export type ClassificationBucketKey = "chemical" | "packaging" | "sparepart";

export interface DeliveredClassificationAggRowRaw {
  bucket: ClassificationBucketKey;
  total_amount_idr: string;
  total_qty: string;
}

/** One delivered PO line for procurement-style plant report (date range on delivery day). */
export interface ProcurementReportLineRow {
  delivered_on: string;
  bucket: ClassificationBucketKey;
  pt: string | null;
  plant: string | null;
  item_description: string | null;
  line_unit: string | null;
  qty: number;
  unit_price: number;
  currency: string | null;
  currency_rate: number | null;
  amount_idr: number;
}

/** One row per delivered shipment in the selected period (management dashboard). */
export interface DeliveredManagementRow {
  shipment_id: string;
  shipment_number: string;
  pt: string | null;
  plant: string | null;
  product_classification: string | null;
  vendor_name: string | null;
  /** Delivered line value in IDR (same rules as shipment detail total_items_amount). */
  total_amount_idr: number;
  /** Freight / service & charge from shipment (incoterm_amount). */
  freight_charge: number | null;
  /** Currency for freight_charge (USD or IDR). */
  freight_charge_currency: string;
  /** Sum of received quantities across all coupled PO lines on the shipment. */
  total_qty: number;
}

function buildDeliveredShipmentWhere(
  query: DeliveredManagementQuery,
  params: unknown[],
  startIdx: number
): { where: string; nextIdx: number } {
  const conditions: string[] = ["s.current_status = 'DELIVERED'", "s.deleted_at IS NULL"];
  let idx = startIdx;
  if (query.month != null) {
    conditions.push(`EXTRACT(MONTH FROM COALESCE(s.closed_at, s.ata, s.updated_at)) = $${idx++}`);
    params.push(query.month);
  }
  if (query.year != null) {
    conditions.push(`EXTRACT(YEAR FROM COALESCE(s.closed_at, s.ata, s.updated_at)) = $${idx++}`);
    params.push(query.year);
  }
  return { where: conditions.join(" AND "), nextIdx: idx };
}

export class DashboardRepository {
  private get pool(): Pool {
    return getPool();
  }

  /**
   * Delivered shipments in month/year (on closed/ata/updated date), with:
   * - PT / plant from primary linked PO (lowest po_number among active mappings)
   * - total_amount_idr: Σ(qty × unit_price) in IDR (FX via mapping currency_rate when PO is not IDR/RP)
   * - freight_charge: shipment.incoterm_amount; freight_charge_currency: shipment.incoterm_currency
   * - total_qty: Σ(received_qty)
   * Shipments with no line rows still appear (amount/qty 0).
   */
  async getDeliveredManagementSummary(query: DeliveredManagementQuery): Promise<DeliveredManagementRow[]> {
    const params: unknown[] = [];
    const { where: shipmentWhere } = buildDeliveredShipmentWhere(query, params, 1);

    const pcExpr = `(CASE TRIM(b.product_classification)
        WHEN 'Checmical' THEN 'Chemical'
        WHEN 'Packaging' THEN 'Package'
        ELSE NULLIF(TRIM(b.product_classification), '')
      END)`;

    const result = await this.pool.query<{
      shipment_id: string;
      shipment_number: string;
      pt: string | null;
      plant: string | null;
      product_classification: string | null;
      vendor_name: string | null;
      total_amount_idr: string;
      freight_charge: string | null;
      freight_charge_currency: string;
      total_qty: string;
    }>(
      `WITH base AS (
        SELECT
          s.id AS shipment_id,
          s.shipment_no AS shipment_number,
          s.vendor_name,
          s.product_classification,
          s.incoterm_amount,
          s.incoterm_currency
        FROM shipments s
        WHERE ${shipmentWhere}
      ),
      lines AS (
        SELECT
          b.shipment_id,
          COALESCE(r.received_qty, 0)::numeric AS qty,
          COALESCE(it.unit_price, 0)::numeric AS unit_price,
          po.currency,
          m.currency_rate
        FROM base b
        INNER JOIN shipment_po_mapping m
          ON m.shipment_id = b.shipment_id AND m.decoupled_at IS NULL
        INNER JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id
        INNER JOIN Import_purchase_order_items it
          ON it.id = r.item_id AND it.import_purchase_order_id = r.intake_id
        INNER JOIN Import_purchase_order po
          ON po.id = r.intake_id
      ),
      amounts AS (
        SELECT
          shipment_id,
          qty,
          (qty * unit_price * CASE
            WHEN UPPER(TRIM(COALESCE(currency, ''))) IN ('IDR', 'RP') THEN 1::numeric
            ELSE COALESCE(NULLIF(currency_rate, 0), 1)::numeric
          END) AS amount_idr
        FROM lines
      ),
      line_sums AS (
        SELECT
          shipment_id,
          SUM(qty) AS total_qty,
          SUM(amount_idr) AS total_amount_idr
        FROM amounts
        GROUP BY shipment_id
      ),
      primary_po AS (
        SELECT DISTINCT ON (m.shipment_id)
          m.shipment_id,
          NULLIF(TRIM(i.pt), '') AS pt,
          NULLIF(TRIM(i.plant), '') AS plant
        FROM shipment_po_mapping m
        INNER JOIN Import_purchase_order i ON i.id = m.intake_id
        INNER JOIN base b ON b.shipment_id = m.shipment_id
        WHERE m.decoupled_at IS NULL
        ORDER BY m.shipment_id, i.po_number ASC NULLS LAST, i.created_at ASC
      )
      SELECT
        b.shipment_id,
        b.shipment_number,
        pp.pt,
        pp.plant,
        ${pcExpr} AS product_classification,
        NULLIF(TRIM(b.vendor_name), '') AS vendor_name,
        COALESCE(ls.total_amount_idr, 0)::text AS total_amount_idr,
        b.incoterm_amount::text AS freight_charge,
        b.incoterm_currency AS freight_charge_currency,
        COALESCE(ls.total_qty, 0)::text AS total_qty
      FROM base b
      LEFT JOIN line_sums ls ON ls.shipment_id = b.shipment_id
      LEFT JOIN primary_po pp ON pp.shipment_id = b.shipment_id
      ORDER BY b.shipment_number DESC`,
      params
    );

    return result.rows.map((row) => ({
      shipment_id: row.shipment_id,
      shipment_number: row.shipment_number,
      pt: row.pt,
      plant: row.plant,
      product_classification: row.product_classification,
      vendor_name: row.vendor_name,
      total_amount_idr: parseFloat(row.total_amount_idr),
      freight_charge: row.freight_charge != null ? parseFloat(row.freight_charge) : null,
      freight_charge_currency: row.freight_charge_currency ?? "IDR",
      total_qty: parseFloat(row.total_qty),
    }));
  }

  /**
   * Σ amount (IDR) and Σ qty by PT + plant from each delivered line’s PO header.
   * Optional exact match filters on trimmed pt / plant (same values as Create PO dropdowns).
   */
  async getDeliveredByPtPlantAgg(query: DeliveredPtPlantAggQuery): Promise<DeliveredPtPlantAggRow[]> {
    const params: unknown[] = [];
    const { where: shipmentWhere, nextIdx } = buildDeliveredShipmentWhere(query, params, 1);
    let idx = nextIdx;
    const lineFilters: string[] = [];
    if (query.pt != null && query.pt.trim() !== "") {
      lineFilters.push(`TRIM(COALESCE(i.pt, '')) = $${idx++}`);
      params.push(query.pt.trim());
    }
    if (query.plant != null && query.plant.trim() !== "") {
      lineFilters.push(`TRIM(COALESCE(i.plant, '')) = $${idx++}`);
      params.push(query.plant.trim());
    }
    const lineFilterSql = lineFilters.length > 0 ? `AND ${lineFilters.join(" AND ")}` : "";

    const result = await this.pool.query<{
      pt: string | null;
      plant: string | null;
      total_amount_idr: string;
      total_qty: string;
    }>(
      `WITH base AS (
        SELECT s.id AS shipment_id
        FROM shipments s
        WHERE ${shipmentWhere}
      ),
      detail AS (
        SELECT
          NULLIF(TRIM(i.pt), '') AS pt,
          NULLIF(TRIM(i.plant), '') AS plant,
          COALESCE(r.received_qty, 0)::numeric AS qty,
          COALESCE(it.unit_price, 0)::numeric AS unit_price,
          i.currency,
          m.currency_rate
        FROM base b
        INNER JOIN shipment_po_mapping m
          ON m.shipment_id = b.shipment_id AND m.decoupled_at IS NULL
        INNER JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id
        INNER JOIN Import_purchase_order_items it
          ON it.id = r.item_id AND it.import_purchase_order_id = r.intake_id
        INNER JOIN Import_purchase_order i ON i.id = r.intake_id
        WHERE TRUE ${lineFilterSql}
      ),
      valued AS (
        SELECT
          pt,
          plant,
          qty,
          (qty * unit_price * CASE
            WHEN UPPER(TRIM(COALESCE(currency, ''))) IN ('IDR', 'RP') THEN 1::numeric
            ELSE COALESCE(NULLIF(currency_rate, 0), 1)::numeric
          END) AS amount_idr
        FROM detail
      )
      SELECT
        pt,
        plant,
        COALESCE(SUM(amount_idr), 0)::text AS total_amount_idr,
        COALESCE(SUM(qty), 0)::text AS total_qty
      FROM valued
      GROUP BY pt, plant
      ORDER BY pt ASC NULLS LAST, plant ASC NULLS LAST`,
      params
    );

    return result.rows.map((row) => ({
      pt: row.pt,
      plant: row.plant,
      total_amount_idr: parseFloat(row.total_amount_idr),
      total_qty: parseFloat(row.total_qty),
    }));
  }

  /**
   * Σ amount (IDR) and Σ qty by shipment product classification bucket:
   * chemical | packaging | sparepart (non-chem non-pack → sparepart).
   */
  async getDeliveredByClassificationAggRaw(query: DeliveredClassificationAggQuery): Promise<DeliveredClassificationAggRowRaw[]> {
    const params: unknown[] = [];
    const { where: shipmentWhere } = buildDeliveredShipmentWhere(query, params, 1);

    const bucketExpr = `(
      CASE
        WHEN TRIM(COALESCE(b.product_classification, '')) IN ('Checmical', 'Chemical') THEN 'chemical'
        WHEN TRIM(COALESCE(b.product_classification, '')) IN ('Packaging', 'Package') THEN 'packaging'
        ELSE 'sparepart'
      END
    )`;

    const result = await this.pool.query<{
      bucket: ClassificationBucketKey;
      total_amount_idr: string;
      total_qty: string;
    }>(
      `WITH base AS (
        SELECT s.id AS shipment_id, s.product_classification
        FROM shipments s
        WHERE ${shipmentWhere}
      ),
      lines AS (
        SELECT
          b.shipment_id,
          ${bucketExpr} AS bucket,
          COALESCE(r.received_qty, 0)::numeric AS qty,
          COALESCE(it.unit_price, 0)::numeric AS unit_price,
          po.currency,
          m.currency_rate
        FROM base b
        INNER JOIN shipment_po_mapping m
          ON m.shipment_id = b.shipment_id AND m.decoupled_at IS NULL
        INNER JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id
        INNER JOIN Import_purchase_order_items it
          ON it.id = r.item_id AND it.import_purchase_order_id = r.intake_id
        INNER JOIN Import_purchase_order po ON po.id = r.intake_id
      ),
      valued AS (
        SELECT
          bucket,
          qty,
          (qty * unit_price * CASE
            WHEN UPPER(TRIM(COALESCE(currency, ''))) IN ('IDR', 'RP') THEN 1::numeric
            ELSE COALESCE(NULLIF(currency_rate, 0), 1)::numeric
          END) AS amount_idr
        FROM lines
      )
      SELECT
        bucket,
        COALESCE(SUM(amount_idr), 0)::text AS total_amount_idr,
        COALESCE(SUM(qty), 0)::text AS total_qty
      FROM valued
      GROUP BY bucket`,
      params
    );

    return result.rows.map((row) => ({
      bucket: row.bucket,
      total_amount_idr: row.total_amount_idr,
      total_qty: row.total_qty,
    }));
  }

  /**
   * Delivered PO lines with plant, item, bucket (from shipment classification), and amounts.
   * `rangeStart` / `rangeEnd` are inclusive calendar dates (YYYY-MM-DD) in UTC delivery day.
   */
  async getProcurementReportLines(rangeStart: string, rangeEnd: string): Promise<ProcurementReportLineRow[]> {
    const bucketExpr = `(
      CASE
        WHEN TRIM(COALESCE(b.product_classification, '')) IN ('Checmical', 'Chemical') THEN 'chemical'
        WHEN TRIM(COALESCE(b.product_classification, '')) IN ('Packaging', 'Package') THEN 'packaging'
        ELSE 'sparepart'
      END
    )`;

    const result = await this.pool.query<{
      delivered_on: string;
      bucket: ClassificationBucketKey;
      pt: string | null;
      plant: string | null;
      item_description: string | null;
      line_unit: string | null;
      qty: string;
      unit_price: string;
      currency: string | null;
      currency_rate: string | null;
      amount_idr: string;
    }>(
      `WITH base AS (
        SELECT
          s.id AS shipment_id,
          s.product_classification,
          (COALESCE(s.closed_at, s.ata, s.updated_at) AT TIME ZONE 'UTC')::date AS delivered_on
        FROM shipments s
        WHERE s.current_status = 'DELIVERED'
        AND s.deleted_at IS NULL
        AND (COALESCE(s.closed_at, s.ata, s.updated_at) AT TIME ZONE 'UTC')::date >= $1::date
        AND (COALESCE(s.closed_at, s.ata, s.updated_at) AT TIME ZONE 'UTC')::date <= $2::date
      ),
      detail AS (
        SELECT
          b.delivered_on::text AS delivered_on,
          ${bucketExpr} AS bucket,
          NULLIF(TRIM(i.pt), '') AS pt,
          NULLIF(TRIM(i.plant), '') AS plant,
          NULLIF(TRIM(it.item_description), '') AS item_description,
          NULLIF(TRIM(it.unit), '') AS line_unit,
          COALESCE(r.received_qty, 0)::numeric AS qty,
          COALESCE(it.unit_price, 0)::numeric AS unit_price,
          NULLIF(TRIM(COALESCE(i.currency, '')), '') AS currency,
          m.currency_rate
        FROM base b
        INNER JOIN shipment_po_mapping m
          ON m.shipment_id = b.shipment_id AND m.decoupled_at IS NULL
        INNER JOIN shipment_po_line_received r
          ON r.shipment_id = m.shipment_id AND r.intake_id = m.intake_id
        INNER JOIN Import_purchase_order_items it
          ON it.id = r.item_id AND it.import_purchase_order_id = r.intake_id
        INNER JOIN Import_purchase_order i ON i.id = r.intake_id
      )
      SELECT
        delivered_on,
        bucket,
        pt,
        plant,
        item_description,
        line_unit,
        qty::text,
        unit_price::text,
        currency,
        currency_rate::text,
        (qty * unit_price * CASE
          WHEN UPPER(TRIM(COALESCE(currency, ''))) IN ('IDR', 'RP') THEN 1::numeric
          ELSE COALESCE(NULLIF(currency_rate, 0), 1)::numeric
        END)::text AS amount_idr
      FROM detail`,
      [rangeStart, rangeEnd]
    );

    return result.rows.map((row) => ({
      delivered_on: row.delivered_on,
      bucket: row.bucket,
      pt: row.pt,
      plant: row.plant,
      item_description: row.item_description,
      line_unit: row.line_unit,
      qty: parseFloat(row.qty),
      unit_price: parseFloat(row.unit_price),
      currency: row.currency,
      currency_rate: row.currency_rate != null ? parseFloat(row.currency_rate) : null,
      amount_idr: parseFloat(row.amount_idr),
    }));
  }
}
