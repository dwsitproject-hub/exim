/**
 * PO intake repository: database access only. No business logic.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "../../../db/index.js";
import type {
  CreatePoIntakeDto,
  ListPoIntakeQuery,
  PoImportHistoryRow,
  PoIntakeRow,
  PoIntakeItemRow,
  PoListFilterOptions,
  UpdatePoIntakeDto,
} from "../dto/index.js";

const EMPTY_FILTER_TOKEN = "—";

function sortDistinctDisplay(values: string[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    set.add(t === "" ? EMPTY_FILTER_TOKEN : t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function appendMultiTextOrEmpty(
  conditions: string[],
  params: unknown[],
  columnSql: string,
  values: string[] | undefined,
  idx: { n: number }
): void {
  if (!values?.length) return;
  const hasEmpty = values.includes(EMPTY_FILTER_TOKEN);
  const nonempty = values.filter((v) => v !== EMPTY_FILTER_TOKEN).map((v) => v.trim());
  const parts: string[] = [];
  if (hasEmpty) {
    parts.push(`(${columnSql} IS NULL OR TRIM(COALESCE(${columnSql}, '')) = '')`);
  }
  if (nonempty.length) {
    parts.push(`TRIM(COALESCE(${columnSql}, '')) = ANY($${idx.n}::text[])`);
    params.push(nonempty);
    idx.n++;
  }
  if (parts.length) conditions.push(`(${parts.join(" OR ")})`);
}

function appendMultiExactOrEmpty(
  conditions: string[],
  params: unknown[],
  columnSql: string,
  values: string[] | undefined,
  idx: { n: number }
): void {
  if (!values?.length) return;
  const hasEmpty = values.includes(EMPTY_FILTER_TOKEN);
  const nonempty = values.filter((v) => v !== EMPTY_FILTER_TOKEN).map((v) => v.trim());
  const parts: string[] = [];
  if (hasEmpty) {
    parts.push(`(${columnSql} IS NULL OR TRIM(COALESCE(${columnSql}::text, '')) = '')`);
  }
  if (nonempty.length) {
    parts.push(`${columnSql} = ANY($${idx.n}::text[])`);
    params.push(nonempty);
    idx.n++;
  }
  if (parts.length) conditions.push(`(${parts.join(" OR ")})`);
}

function appendMultiDateOrNull(
  conditions: string[],
  params: unknown[],
  columnSql: string,
  values: string[] | undefined,
  idx: { n: number }
): void {
  if (!values?.length) return;
  const hasEmpty = values.includes(EMPTY_FILTER_TOKEN);
  const nonempty = values.filter((v) => v !== EMPTY_FILTER_TOKEN);
  const parts: string[] = [];
  if (hasEmpty) {
    parts.push(`${columnSql} IS NULL`);
  }
  if (nonempty.length) {
    parts.push(
      `to_char((${columnSql} AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') = ANY($${idx.n}::text[])`
    );
    params.push(nonempty);
    idx.n++;
  }
  if (parts.length) conditions.push(`(${parts.join(" OR ")})`);
}

export class PoIntakeRepository {
  private get pool(): Pool {
    return getPool();
  }

  /** Returns true if external_id already exists (duplicate prevention). */
  async existsByExternalId(externalId: string): Promise<boolean> {
    const result = await this.pool.query<{ n: number }>(
      `SELECT 1 AS n FROM Import_purchase_order WHERE external_id = $1 LIMIT 1`,
      [externalId]
    );
    return result.rows.length > 0;
  }

  /** True if another row already uses this PO number (case-insensitive, trimmed). */
  async existsByPoNumberTrimmed(poNumber: string): Promise<boolean> {
    const result = await this.pool.query<{ n: number }>(
      `SELECT 1 AS n FROM Import_purchase_order
       WHERE LOWER(TRIM(po_number)) = LOWER(TRIM($1)) LIMIT 1`,
      [poNumber]
    );
    return result.rows.length > 0;
  }

  async existsByPoNumberTrimmedExcludingId(poNumber: string, excludeIntakeId: string): Promise<boolean> {
    const result = await this.pool.query<{ n: number }>(
      `SELECT 1 AS n FROM Import_purchase_order
       WHERE LOWER(TRIM(po_number)) = LOWER(TRIM($1)) AND id <> $2::uuid LIMIT 1`,
      [poNumber, excludeIntakeId]
    );
    return result.rows.length > 0;
  }

  /** Resolve intake id by PO number (trimmed, case-insensitive). */
  async findIdByPoNumberTrimmed(poNumber: string): Promise<string | null> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM Import_purchase_order
       WHERE LOWER(TRIM(po_number)) = LOWER(TRIM($1)) LIMIT 1`,
      [poNumber]
    );
    return result.rows[0]?.id ?? null;
  }

  async create(dto: CreatePoIntakeDto, intakeStatus: string, createdByUserId?: string | null): Promise<PoIntakeRow> {
    const result = await this.pool.query<PoIntakeRow>(
      `INSERT INTO Import_purchase_order
       (external_id, po_number, plant, pt, supplier_name, delivery_location, incoterm_location, kawasan_berikat, currency, intake_status, total_amount_po, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, NOW(), NOW())
       RETURNING id, external_id, po_number, plant, pt, supplier_name, delivery_location, incoterm_location, kawasan_berikat, currency,
         intake_status, created_by_user_id, taken_by_user_id, taken_at, created_at, updated_at`,
      [
        dto.external_id,
        dto.po_number,
        dto.plant ?? null,
        dto.pt ?? null,
        dto.supplier_name,
        dto.delivery_location ?? null,
        dto.incoterm_location ?? null,
        dto.kawasan_berikat ?? null,
        dto.currency ?? null,
        intakeStatus,
        createdByUserId ?? null,
      ]
    );
    if (!result.rows[0]) throw new Error("PoIntakeRepository.create: no row returned");
    return result.rows[0];
  }

  async insertItems(intakeId: string, items: CreatePoIntakeDto["items"]): Promise<void> {
    if (!items?.length) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const qty = it?.qty ?? null;
      const unitPrice = it?.value ?? null;
      const totalAmountItem = qty != null && unitPrice != null ? qty * unitPrice : null;
      await this.pool.query(
        `INSERT INTO Import_purchase_order_items (import_purchase_order_id, line_number, item_description, qty, unit, unit_price, total_amount_item)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          intakeId,
          it?.line_number ?? i + 1,
          it?.item_description ?? null,
          qty,
          it?.unit ?? null,
          unitPrice,
          totalAmountItem,
        ]
      );
    }
    await this.recomputeTotalAmountPo(intakeId);
  }

  /**
   * Single transaction: insert PO header + all lines in one batch INSERT (faster than row-by-row).
   */
  async createWithItemsInTransaction(
    dto: CreatePoIntakeDto,
    intakeStatus: string,
    createdByUserId?: string | null
  ): Promise<PoIntakeRow> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await this.createWithItemsUsingClient(client, dto, intakeStatus, createdByUserId);
      await client.query("COMMIT");
      return row;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Insert PO header + all lines on an open transaction (caller manages BEGIN/COMMIT/ROLLBACK).
   */
  async createWithItemsUsingClient(
    client: PoolClient,
    dto: CreatePoIntakeDto,
    intakeStatus: string,
    createdByUserId?: string | null
  ): Promise<PoIntakeRow> {
    const result = await client.query<PoIntakeRow>(
      `INSERT INTO Import_purchase_order
       (external_id, po_number, plant, pt, supplier_name, delivery_location, incoterm_location, kawasan_berikat, currency, intake_status, total_amount_po, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, NOW(), NOW())
       RETURNING id, external_id, po_number, plant, pt, supplier_name, delivery_location, incoterm_location, kawasan_berikat, currency,
         intake_status, created_by_user_id, taken_by_user_id, taken_at, created_at, updated_at`,
      [
        dto.external_id,
        dto.po_number,
        dto.plant ?? null,
        dto.pt ?? null,
        dto.supplier_name,
        dto.delivery_location ?? null,
        dto.incoterm_location ?? null,
        dto.kawasan_berikat ?? null,
        dto.currency ?? null,
        intakeStatus,
        createdByUserId ?? null,
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error("PoIntakeRepository.createWithItemsUsingClient: no row returned");
    await this.insertItemsBatch(client, row.id, dto.items);
    await client.query(
      `UPDATE Import_purchase_order p
       SET total_amount_po = COALESCE((
         SELECT SUM(COALESCE(i.total_amount_item, 0))
         FROM import_purchase_order_items i
         WHERE i.import_purchase_order_id = p.id
       ), 0),
       updated_at = NOW()
       WHERE p.id = $1::uuid`,
      [row.id]
    );
    return row;
  }

  private async insertItemsBatch(
    client: PoolClient,
    intakeId: string,
    items: CreatePoIntakeDto["items"] | undefined
  ): Promise<void> {
    if (!items?.length) return;
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      const qty = it?.qty ?? null;
      const unitPrice = it?.value ?? null;
      const totalAmountItem = qty != null && unitPrice != null ? qty * unitPrice : null;
      placeholders.push(`($${p++}::uuid, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      values.push(
        intakeId,
        it?.line_number ?? i + 1,
        it?.item_description ?? null,
        qty,
        it?.unit ?? null,
        unitPrice,
        totalAmountItem
      );
    }
    await client.query(
      `INSERT INTO Import_purchase_order_items (import_purchase_order_id, line_number, item_description, qty, unit, unit_price, total_amount_item)
       VALUES ${placeholders.join(", ")}`,
      values
    );
  }

  async listItemIdsForIntake(intakeId: string): Promise<string[]> {
    const result = await this.pool.query<{ id: string }>(
      `SELECT id FROM Import_purchase_order_items WHERE import_purchase_order_id = $1`,
      [intakeId]
    );
    return result.rows.map((r) => r.id);
  }

  /**
   * Delete a PO line only when no shipment has recorded received qty for it.
   * @returns `blocked` if deliveries reference this line; `deleted` if a row was removed.
   */
  async tryDeleteItemIfNoLineReceived(intakeId: string, itemId: string): Promise<{ deleted: boolean; blocked: boolean }> {
    const block = await this.pool.query(`SELECT 1 FROM shipment_po_line_received WHERE item_id = $1 LIMIT 1`, [itemId]);
    if (block.rows.length > 0) return { deleted: false, blocked: true };
    const r = await this.pool.query(
      `DELETE FROM Import_purchase_order_items WHERE id = $1::uuid AND import_purchase_order_id = $2::uuid`,
      [itemId, intakeId]
    );
    return { deleted: (r.rowCount ?? 0) > 0, blocked: false };
  }

  async updateItemRow(
    intakeId: string,
    itemId: string,
    lineNumber: number,
    itemDescription: string,
    qty: number,
    unit: string,
    unitPrice: number
  ): Promise<boolean> {
    const totalAmountItem = qty * unitPrice;
    const r = await this.pool.query(
      `UPDATE Import_purchase_order_items
       SET line_number = $3, item_description = $4, qty = $5, unit = $6, unit_price = $7, total_amount_item = $8
       WHERE id = $2::uuid AND import_purchase_order_id = $1::uuid`,
      [intakeId, itemId, lineNumber, itemDescription, qty, unit, unitPrice, totalAmountItem]
    );
    return (r.rowCount ?? 0) > 0;
  }

  async insertSingleItem(
    intakeId: string,
    lineNumber: number,
    itemDescription: string,
    qty: number,
    unit: string,
    unitPrice: number
  ): Promise<void> {
    const totalAmountItem = qty * unitPrice;
    await this.pool.query(
      `INSERT INTO Import_purchase_order_items (import_purchase_order_id, line_number, item_description, qty, unit, unit_price, total_amount_item)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
      [intakeId, lineNumber, itemDescription, qty, unit, unitPrice, totalAmountItem]
    );
  }

  async updateIntakeHeader(intakeId: string, dto: UpdatePoIntakeDto): Promise<void> {
    await this.pool.query(
      `UPDATE Import_purchase_order SET
         po_number = $2,
         plant = $3,
         pt = $4,
         supplier_name = $5,
         delivery_location = $6,
         incoterm_location = $7,
         kawasan_berikat = $8,
         currency = $9,
         updated_at = NOW()
       WHERE id = $1::uuid`,
      [
        intakeId,
        dto.po_number,
        dto.plant ?? null,
        dto.pt ?? null,
        dto.supplier_name,
        dto.delivery_location ?? null,
        dto.incoterm_location ?? null,
        dto.kawasan_berikat ?? null,
        dto.currency ?? null,
      ]
    );
  }

  async findById(id: string): Promise<PoIntakeRow | null> {
    const result = await this.pool.query<PoIntakeRow>(
      `SELECT id, external_id, po_number, plant, pt, supplier_name, delivery_location, incoterm_location, kawasan_berikat, currency,
        intake_status, created_by_user_id, taken_by_user_id, taken_at, created_at, updated_at
       FROM Import_purchase_order WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findItemsByIntakeId(intakeId: string): Promise<PoIntakeItemRow[]> {
    const result = await this.pool.query<PoIntakeItemRow>(
      `SELECT id, import_purchase_order_id, line_number, item_description, qty, unit, unit_price AS value, created_at
       FROM Import_purchase_order_items WHERE import_purchase_order_id = $1 ORDER BY line_number ASC`,
      [intakeId]
    );
    return result.rows;
  }

  /** Sum of line amounts: unit_price × qty. Used for BM/PPN/PPH/PDRI. */
  async getTotalItemsAmountForIntakeIds(intakeIds: string[]): Promise<number> {
    if (intakeIds.length === 0) return 0;
    const result = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(
         COALESCE(i.unit_price, 0) * COALESCE(i.qty, 0)
       ), 0)::text AS total
       FROM Import_purchase_order_items i WHERE i.import_purchase_order_id = ANY($1::uuid[])`,
      [intakeIds]
    );
    const total = result.rows[0]?.total;
    return total != null ? parseFloat(total) : 0;
  }

  async recomputeTotalAmountPo(intakeId: string): Promise<void> {
    await this.pool.query(
      `UPDATE Import_purchase_order p
       SET total_amount_po = COALESCE((
         SELECT SUM(COALESCE(i.total_amount_item, 0))
         FROM Import_purchase_order_items i
         WHERE i.import_purchase_order_id = p.id
       ), 0),
       updated_at = NOW()
       WHERE p.id = $1`,
      [intakeId]
    );
  }

  async recomputeTotalAmountItemByLine(intakeId: string, itemId: string): Promise<void> {
    await this.pool.query(
      `UPDATE Import_purchase_order_items
       SET total_amount_item = COALESCE(unit_price, 0) * COALESCE(qty, 0)
       WHERE id = $1 AND import_purchase_order_id = $2`,
      [itemId, intakeId]
    );
    await this.recomputeTotalAmountPo(intakeId);
  }

  private buildPoListOrderBy(query: ListPoIntakeQuery): string {
    const dir = query.sort_dir === "desc" ? "DESC" : "ASC";
    const key = query.sort_by?.trim() ?? "";
    const cols: Record<string, string> = {
      po_number: "i.po_number",
      external_id: "i.external_id",
      pt: "i.pt",
      plant: "i.plant",
      supplier: "i.supplier_name",
      delivery_location: "i.delivery_location",
      incoterm_location: "i.incoterm_location",
      kawasan_berikat: "i.kawasan_berikat",
      currency: "i.currency",
      intake_status: "i.intake_status",
      taken_by_user_id: "i.taken_by_user_id",
      taken_by_name: "u.name",
      taken_at: "i.taken_at",
      created_at: "i.created_at",
      updated_at: "i.updated_at",
    };
    const expr = cols[key];
    if (!expr) {
      return "ORDER BY i.created_at DESC NULLS LAST, i.id DESC";
    }
    return `ORDER BY ${expr} ${dir} NULLS LAST, i.id ${dir}`;
  }

  async findAll(query: ListPoIntakeQuery): Promise<{
    rows: (PoIntakeRow & { taken_by_name: string | null })[];
    total: number;
  }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const offset = (page - 1) * limit;
    const conditions: string[] = ["TRUE"];
    const params: unknown[] = [];
    let idx = 1;

    if (query.intake_status) {
      conditions.push(`i.intake_status = $${idx++}`);
      params.push(query.intake_status);
    }
    if (query.po_numbers?.length) {
      const filterIdx = { n: idx };
      appendMultiExactOrEmpty(conditions, params, "i.po_number", query.po_numbers, filterIdx);
      idx = filterIdx.n;
    } else if (query.po_number) {
      conditions.push(`i.po_number ILIKE $${idx++}`);
      params.push(`%${query.po_number}%`);
    }
    if (query.search) {
      conditions.push(
        `(i.po_number ILIKE $${idx} OR i.supplier_name ILIKE $${idx} OR i.external_id ILIKE $${idx})`
      );
      params.push(`%${query.search}%`);
      idx++;
    }
    if (query.unclaimed_only) {
      conditions.push(`i.taken_by_user_id IS NULL`);
    }
    if (query.detected_older_than_days != null && query.detected_older_than_days > 0) {
      conditions.push(`i.created_at < NOW() - ($${idx++}::int * INTERVAL '1 day')`);
      params.push(query.detected_older_than_days);
    }
    if (query.has_linked_shipment === false) {
      conditions.push(
        `NOT EXISTS (SELECT 1 FROM shipment_po_mapping m WHERE m.intake_id = i.id AND m.decoupled_at IS NULL)`
      );
    }
    if (query.has_linked_shipment === true) {
      conditions.push(
        `EXISTS (SELECT 1 FROM shipment_po_mapping m WHERE m.intake_id = i.id AND m.decoupled_at IS NULL)`
      );
    }

    const filterIdx = { n: idx };
    appendMultiTextOrEmpty(conditions, params, "i.external_id", query.external_ids, filterIdx);
    appendMultiTextOrEmpty(conditions, params, "i.pt", query.pts, filterIdx);
    appendMultiTextOrEmpty(conditions, params, "i.plant", query.plants, filterIdx);
    appendMultiTextOrEmpty(conditions, params, "i.supplier_name", query.supplier_names, filterIdx);
    appendMultiTextOrEmpty(conditions, params, "i.delivery_location", query.delivery_locations, filterIdx);
    appendMultiTextOrEmpty(conditions, params, "i.incoterm_location", query.incoterm_locations, filterIdx);
    appendMultiTextOrEmpty(conditions, params, "i.kawasan_berikat", query.kawasan_berikats, filterIdx);
    appendMultiTextOrEmpty(conditions, params, "i.currency", query.currencies, filterIdx);
    if (query.intake_statuses?.length) {
      conditions.push(`i.intake_status = ANY($${filterIdx.n}::text[])`);
      params.push(query.intake_statuses);
      filterIdx.n++;
    }
    appendMultiExactOrEmpty(conditions, params, "i.taken_by_user_id", query.taken_by_user_ids, filterIdx);
    appendMultiTextOrEmpty(conditions, params, "u.name", query.taken_by_names, filterIdx);
    appendMultiDateOrNull(conditions, params, "i.taken_at", query.taken_at_dates, filterIdx);
    appendMultiDateOrNull(conditions, params, "i.created_at", query.created_at_dates, filterIdx);
    appendMultiDateOrNull(conditions, params, "i.updated_at", query.updated_at_dates, filterIdx);
    idx = filterIdx.n;

    const fromJoin = `Import_purchase_order i LEFT JOIN users u ON u.id::text = i.taken_by_user_id`;
    const where = conditions.join(" AND ");
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${fromJoin} WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    params.push(limit, offset);
    const result = await this.pool.query<PoIntakeRow & { taken_by_name: string | null }>(
      `SELECT i.id, i.external_id, i.po_number, i.plant, i.pt, i.supplier_name, i.delivery_location, i.incoterm_location, i.kawasan_berikat, i.currency,
        i.intake_status, i.created_by_user_id, i.taken_by_user_id, i.taken_at, i.created_at, i.updated_at,
        u.name AS taken_by_name
       FROM ${fromJoin}
       WHERE ${where}
       ${this.buildPoListOrderBy(query)} LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    return { rows: result.rows, total };
  }

  /**
   * Distinct values per column for PO list filters (full database).
   */
  async listDistinctFilterOptions(): Promise<PoListFilterOptions> {
    const [
      poNum,
      extId,
      pt,
      plant,
      supplier,
      delivery,
      inco,
      kb,
      cur,
      status,
      takerId,
      takerName,
      takenDates,
      createdDates,
      updatedDates,
    ] = await Promise.all([
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(i.po_number) AS v FROM Import_purchase_order i ORDER BY v`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.external_id, '')) AS v FROM Import_purchase_order i ORDER BY v`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.pt, '')) AS v FROM Import_purchase_order i ORDER BY v`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.plant, '')) AS v FROM Import_purchase_order i ORDER BY v`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.supplier_name, '')) AS v FROM Import_purchase_order i ORDER BY v`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.delivery_location, '')) AS v FROM Import_purchase_order i ORDER BY v`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.incoterm_location, '')) AS v FROM Import_purchase_order i ORDER BY v`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.kawasan_berikat, '')) AS v FROM Import_purchase_order i ORDER BY v`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.currency, '')) AS v FROM Import_purchase_order i ORDER BY v`
      ),
      this.pool.query<{ s: string }>(
        `SELECT DISTINCT i.intake_status AS s FROM Import_purchase_order i ORDER BY s`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.taken_by_user_id::text, '')) AS v FROM Import_purchase_order i ORDER BY v`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(u.name, '')) AS v
         FROM Import_purchase_order i
         LEFT JOIN users u ON u.id::text = i.taken_by_user_id
         ORDER BY v`
      ),
      this.pool.query<{ d: string }>(
        `SELECT DISTINCT to_char((i.taken_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS d
         FROM Import_purchase_order i WHERE i.taken_at IS NOT NULL ORDER BY d`
      ),
      this.pool.query<{ d: string }>(
        `SELECT DISTINCT to_char((i.created_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS d
         FROM Import_purchase_order i ORDER BY d`
      ),
      this.pool.query<{ d: string }>(
        `SELECT DISTINCT to_char((i.updated_at AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS d
         FROM Import_purchase_order i ORDER BY d`
      ),
    ]);

    const po_numbers = sortDistinctDisplay(poNum.rows.map((r) => r.v));
    const external_ids = sortDistinctDisplay(extId.rows.map((r) => r.v));
    const pts = sortDistinctDisplay(pt.rows.map((r) => r.v));
    const plants = sortDistinctDisplay(plant.rows.map((r) => r.v));
    const supplier_names = sortDistinctDisplay(supplier.rows.map((r) => r.v));
    const delivery_locations = sortDistinctDisplay(delivery.rows.map((r) => r.v));
    const incoterm_locations = sortDistinctDisplay(inco.rows.map((r) => r.v));
    const kawasan_berikats = sortDistinctDisplay(kb.rows.map((r) => r.v));
    const currencies = sortDistinctDisplay(cur.rows.map((r) => r.v));
    const intake_statuses = status.rows.map((r) => r.s).sort((a, b) => a.localeCompare(b));
    const taken_by_user_ids = sortDistinctDisplay(takerId.rows.map((r) => r.v));
    const taken_by_names = sortDistinctDisplay(takerName.rows.map((r) => r.v));

    let taken_at_dates = takenDates.rows.map((r) => r.d).sort((a, b) => a.localeCompare(b));
    const nullTaken = await this.pool.query(`SELECT 1 FROM Import_purchase_order WHERE taken_at IS NULL LIMIT 1`);
    if (nullTaken.rows.length) {
      taken_at_dates = [...taken_at_dates, EMPTY_FILTER_TOKEN].sort((a, b) => a.localeCompare(b));
    }

    const created_at_dates = createdDates.rows.map((r) => r.d).sort((a, b) => a.localeCompare(b));
    const updated_at_dates = updatedDates.rows.map((r) => r.d).sort((a, b) => a.localeCompare(b));

    return {
      po_numbers,
      external_ids,
      pts,
      plants,
      supplier_names,
      delivery_locations,
      incoterm_locations,
      kawasan_berikats,
      currencies,
      intake_statuses,
      taken_by_user_ids,
      taken_by_names,
      taken_at_dates,
      created_at_dates,
      updated_at_dates,
    };
  }

  async updateIntakeStatus(id: string, intakeStatus: string): Promise<PoIntakeRow | null> {
    const result = await this.pool.query<PoIntakeRow>(
      `UPDATE Import_purchase_order SET intake_status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, external_id, po_number, plant, pt, supplier_name, delivery_location, incoterm_location, kawasan_berikat, currency,
         intake_status, created_by_user_id, taken_by_user_id, taken_at, created_at, updated_at`,
      [id, intakeStatus]
    );
    return result.rows[0] ?? null;
  }

  async takeOwnership(id: string, userId: string): Promise<PoIntakeRow | null> {
    const result = await this.pool.query<PoIntakeRow>(
      `UPDATE Import_purchase_order SET intake_status = 'CLAIMED', taken_by_user_id = $1, taken_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING id, external_id, po_number, plant, pt, supplier_name, delivery_location, incoterm_location, kawasan_berikat, currency,
         intake_status, created_by_user_id, taken_by_user_id, taken_at, created_at, updated_at`,
      [userId, id]
    );
    return result.rows[0] ?? null;
  }

  async createImportHistory(input: {
    fileName: string | null;
    uploadedBy: string;
    totalRows: number;
    importedPos: number;
    importedRows: number;
    failedRows: number;
    status: "SUCCESS" | "PARTIAL" | "FAILED";
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO po_intake_import_history
       (file_name, uploaded_by, total_rows, imported_pos, imported_rows, failed_rows, status, created_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        input.fileName,
        input.uploadedBy,
        input.totalRows,
        input.importedPos,
        input.importedRows,
        input.failedRows,
        input.status,
      ]
    );
  }

  async listImportHistory(limit = 20): Promise<PoImportHistoryRow[]> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const result = await this.pool.query<PoImportHistoryRow>(
      `SELECT id, file_name, uploaded_by, total_rows, imported_pos, imported_rows, failed_rows, status, created_at, finished_at
       FROM po_intake_import_history
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit]
    );
    return result.rows;
  }
}
