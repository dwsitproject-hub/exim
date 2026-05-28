import type { Pool, PoolClient } from "pg";
import { getPool } from "../../../db/index.js";
import {
  SERIES_SI_EUP,
  SERIES_CI_EU,
  SERIES_PL_EUP,
  utcYearMonthNow,
  formatSiDocumentNumber,
  formatInvoiceDocumentNumber,
  formatPlDocumentNumber,
} from "../utils/document-numbers.js";
import type {
  CreateExportBulkingShipmentDto,
  UpdateExportBulkingShipmentDto,
  ListExportBulkingQuery,
  ExportBulkingShipmentRow,
  CargoLineDto,
  ShippingInstructionDto,
  SiLineDto,
  InvoiceDto,
  InvoiceLineDto,
  PackingListDto,
  PackingListLineDto,
} from "../dto/index.js";
import { AppError } from "../../../middlewares/errorHandler.js";

async function assertShippingInstructionMatchesShipment(
  client: PoolClient,
  shipmentId: string,
  shippingInstructionId: string,
): Promise<void> {
  const r = await client.query(
    `SELECT 1 FROM export_bulking_shipping_instructions WHERE id = $1 AND shipment_id = $2`,
    [shippingInstructionId, shipmentId],
  );
  if (!r.rows.length) {
    throw new AppError("Shipping instruction does not belong to this shipment", 400);
  }
}

const SHIPMENT_COLUMNS = `id, shipment_no, current_status, vessel_name, voyage_number, shipper,
  loadport_name, received_nomination, received_shipping_instruction,
  incoterms, laycan, laycan_from, laycan_to, est_cargo_readiness, est_cargo_readiness_period,
  eta, ata, nor, etb, atb, commence_loading,
  etc, atc, hose_off, bl_figure, ship_figure, npe_date,
  quantity_spb, spb, delivery_order_pgi, spr, bill_of_lading_no, bill_of_lading_date,
  bill_of_lading_nn_obl, sent_bl, sent_coo, sent_phyto, sent_hc, sent_sr,
  sent_sustainability, present_docs, peb_request_no, peb_no, peb_date, pe_no, pe_date,
  hs_code, currency_tax, biaya_keluar_price_usd_mt, biaya_keluar_amount_idr, biaya_keluar_billing_no,
  levy_price_usd_mt, levy_amount_idr, levy_billing_no, billing_to_gl, td,
  surveyor, surveyor_reason, agent, laytime_rate_mtph, demurrage_rate_pdpr, total_quantity,
  remarks, created_by, created_at, updated_at`;

export class ExportBulkingRepository {
  private get pool(): Pool {
    return getPool();
  }

  /* ───────── shipment number ───────── */

  async generateShipmentNo(): Promise<string> {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prefix = `EXB-${ym}-`;
    const result = await this.pool.query<{ shipment_no: string }>(
      `SELECT shipment_no FROM export_bulking_shipments
       WHERE shipment_no LIKE $1
       ORDER BY shipment_no DESC LIMIT 1`,
      [prefix + "%"],
    );
    const last = result.rows[0]?.shipment_no;
    const nextNum = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(nextNum).padStart(4, "0")}`;
  }

  /** Monotonic per (series, year, month); must run inside an open transaction. */
  private async allocateNextSerial(
    client: PoolClient,
    seriesCode: string,
    year: number,
    month: number,
  ): Promise<number> {
    const r = await client.query<{ last_serial: number }>(
      `INSERT INTO export_bulking_doc_number_counters (series_code, year, month, last_serial)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (series_code, year, month)
       DO UPDATE SET
         last_serial = export_bulking_doc_number_counters.last_serial + 1,
         updated_at = NOW()
       RETURNING last_serial`,
      [seriesCode, year, month],
    );
    return Number(r.rows[0]?.last_serial ?? 0);
  }

  /* ───────── CRUD shipment ───────── */

  async create(dto: CreateExportBulkingShipmentDto, userId?: string): Promise<ExportBulkingShipmentRow> {
    const shipmentNo = await this.generateShipmentNo();
    const result = await this.pool.query<ExportBulkingShipmentRow>(
      `INSERT INTO export_bulking_shipments
        (shipment_no, vessel_name, voyage_number, shipper, loadport_name,
         total_quantity, remarks, current_status, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'SHIPMENT_PLANNING',$8,NOW(),NOW())
       RETURNING ${SHIPMENT_COLUMNS}`,
      [
        shipmentNo,
        dto.vessel_name ?? null,
        dto.voyage_number ?? null,
        dto.shipper ?? null,
        dto.loadport_name ?? null,
        dto.total_quantity ?? null,
        dto.remarks ?? null,
        userId ?? null,
      ],
    );
    if (!result.rows[0]) throw new Error("ExportBulkingRepository.create: no row returned");
    return result.rows[0];
  }

  async list(query: ListExportBulkingQuery): Promise<{ rows: ExportBulkingShipmentRow[]; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const offset = (page - 1) * limit;

    const conditions: string[] = ["s.deleted_at IS NULL"];
    const params: unknown[] = [];
    let idx = 1;

    if (query.statuses && query.statuses.length > 0) {
      if (query.statuses.length === 1) {
        conditions.push(`s.current_status = $${idx++}`);
        params.push(query.statuses[0]);
      } else {
        conditions.push(`s.current_status = ANY($${idx++}::text[])`);
        params.push(query.statuses);
      }
    }

    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(
        `(s.shipment_no ILIKE $${idx} OR s.vessel_name ILIKE $${idx} OR s.shipper ILIKE $${idx})`,
      );
      params.push(term);
      idx++;
    }

    const where = conditions.join(" AND ");

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM export_bulking_shipments s WHERE ${where}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    const dir = query.sort_dir === "desc" ? "DESC" : "ASC";
    const allowedSorts: Record<string, string> = {
      shipment_no: "s.shipment_no",
      current_status: "s.current_status",
      vessel_name: "s.vessel_name",
      voyage_number: "s.voyage_number",
      shipper: "s.shipper",
      loadport_name: "s.loadport_name",
      total_quantity: "s.total_quantity",
      created_at: "s.created_at",
      eta: "s.eta",
    };
    const sortExpr = (query.sort_by && allowedSorts[query.sort_by]) ?? "s.created_at";
    const orderBy = `ORDER BY ${sortExpr} ${dir} NULLS LAST, s.id DESC`;

    params.push(limit, offset);
    const result = await this.pool.query<ExportBulkingShipmentRow>(
      `SELECT ${SHIPMENT_COLUMNS},
        (SELECT COUNT(*)::int FROM export_bulking_cargo_lines cl WHERE cl.shipment_id = s.id) AS cargo_count,
        (SELECT json_agg(json_build_object(
            'item_description', cl2.item_description,
            'destination_port', cl2.destination_port
         ) ORDER BY cl2.line_order)
         FROM export_bulking_cargo_lines cl2 WHERE cl2.shipment_id = s.id
        ) AS cargo_summaries,
        (SELECT array_agg(DISTINCT si.si_number)
         FROM export_bulking_shipping_instructions si
         WHERE si.shipment_id = s.id AND si.si_number IS NOT NULL
        ) AS si_numbers,
        (SELECT array_agg(DISTINCT inv.invoice_no)
         FROM export_bulking_invoices inv
         WHERE inv.shipment_id = s.id AND inv.invoice_no IS NOT NULL
        ) AS invoice_numbers,
        (SELECT array_agg(DISTINCT pl.packing_list_number)
         FROM export_bulking_packing_lists pl
         WHERE pl.shipment_id = s.id AND pl.packing_list_number IS NOT NULL
        ) AS pl_numbers,
        (SELECT json_agg(json_build_object('contract_no', il.contract_no, 'quantity', il.quantity, 'so_no', il.so_no))
         FROM export_bulking_invoice_lines il
         JOIN export_bulking_invoices inv2 ON inv2.id = il.invoice_id
         WHERE inv2.shipment_id = s.id
        ) AS invoice_line_summaries
       FROM export_bulking_shipments s
       WHERE ${where}
       ${orderBy}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      params,
    );

    return { rows: result.rows, total };
  }

  async getById(id: string): Promise<ExportBulkingShipmentRow | null> {
    const result = await this.pool.query<ExportBulkingShipmentRow>(
      `SELECT ${SHIPMENT_COLUMNS} FROM export_bulking_shipments s WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async update(id: string, dto: UpdateExportBulkingShipmentDto): Promise<ExportBulkingShipmentRow | null> {
    const updates: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let idx = 1;

    const fields: (keyof UpdateExportBulkingShipmentDto)[] = [
      "vessel_name", "voyage_number", "shipper", "loadport_name",
      "received_nomination", "received_shipping_instruction", "incoterms", "laycan",
      "laycan_from", "laycan_to", "est_cargo_readiness", "est_cargo_readiness_period",
      "eta", "ata", "nor", "etb", "atb", "commence_loading",
      "etc", "atc", "hose_off", "bl_figure", "ship_figure", "npe_date",
      "quantity_spb", "spb", "delivery_order_pgi", "spr", "bill_of_lading_no",
      "bill_of_lading_date", "bill_of_lading_nn_obl", "sent_bl", "sent_coo", "sent_phyto",
      "sent_hc", "sent_sr", "sent_sustainability", "present_docs", "peb_request_no", "peb_no",
      "peb_date", "pe_no", "pe_date",
      "hs_code", "currency_tax", "biaya_keluar_price_usd_mt", "biaya_keluar_amount_idr", "biaya_keluar_billing_no",
      "levy_price_usd_mt", "levy_amount_idr", "levy_billing_no", "billing_to_gl", "td",
      "surveyor", "surveyor_reason", "agent", "remarks",
    ];

    for (const field of fields) {
      if (dto[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        params.push(dto[field]);
      }
    }

    const numericFields: (keyof UpdateExportBulkingShipmentDto)[] = [
      "laytime_rate_mtph", "demurrage_rate_pdpr", "total_quantity",
    ];
    for (const field of numericFields) {
      if (dto[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        params.push(dto[field]);
      }
    }

    if (params.length === 0) return this.getById(id);

    params.push(id);
    const result = await this.pool.query<ExportBulkingShipmentRow>(
      `UPDATE export_bulking_shipments SET ${updates.join(", ")}
       WHERE id = $${idx} AND deleted_at IS NULL
       RETURNING ${SHIPMENT_COLUMNS}`,
      params,
    );
    return result.rows[0] ?? null;
  }

  async updateStatus(
    id: string,
    newStatus: string,
    userId?: string,
    oldStatus?: string,
  ): Promise<ExportBulkingShipmentRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ExportBulkingShipmentRow>(
        `UPDATE export_bulking_shipments SET current_status = $1, updated_at = NOW()
         WHERE id = $2 AND deleted_at IS NULL
         RETURNING ${SHIPMENT_COLUMNS}`,
        [newStatus, id],
      );
      const row = result.rows[0] ?? null;
      if (row) {
        await client.query(
          `INSERT INTO export_bulking_status_events (shipment_id, old_status, new_status, changed_by, changed_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [id, oldStatus ?? null, newStatus, userId ?? null],
        );
      }
      await client.query("COMMIT");
      return row;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async softDelete(id: string): Promise<ExportBulkingShipmentRow | null> {
    const result = await this.pool.query<ExportBulkingShipmentRow>(
      `UPDATE export_bulking_shipments SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${SHIPMENT_COLUMNS}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async listFilterOptions(): Promise<Record<string, unknown>> {
    const [statusRes, vesselRes, shipperRes, loadportRes, statusCountRes] = await Promise.all([
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT current_status AS v FROM export_bulking_shipments WHERE deleted_at IS NULL ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(vessel_name,'')) AS v FROM export_bulking_shipments
         WHERE deleted_at IS NULL AND TRIM(COALESCE(vessel_name,'')) <> '' ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(shipper,'')) AS v FROM export_bulking_shipments
         WHERE deleted_at IS NULL AND TRIM(COALESCE(shipper,'')) <> '' ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(loadport_name,'')) AS v FROM export_bulking_shipments
         WHERE deleted_at IS NULL AND TRIM(COALESCE(loadport_name,'')) <> '' ORDER BY v`,
      ),
      this.pool.query<{ status: string; cnt: number }>(
        `SELECT current_status AS status, COUNT(*)::int AS cnt
         FROM export_bulking_shipments WHERE deleted_at IS NULL
         GROUP BY current_status`,
      ),
    ]);
    const statusCounts: Record<string, number> = {};
    for (const row of statusCountRes.rows) {
      statusCounts[row.status] = row.cnt;
    }
    return {
      statuses: statusRes.rows.map((r) => r.v),
      vessel_names: vesselRes.rows.map((r) => r.v),
      shippers: shipperRes.rows.map((r) => r.v),
      loadport_names: loadportRes.rows.map((r) => r.v),
      status_counts: statusCounts,
    };
  }

  async getStatusEvents(shipmentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT id, shipment_id, old_status, new_status, changed_by, changed_at, remarks
       FROM export_bulking_status_events
       WHERE shipment_id = $1
       ORDER BY changed_at ASC`,
      [shipmentId],
    );
    return result.rows;
  }

  /* ───────── cargo lines ───────── */

  async listCargoLines(shipmentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT id, shipment_id, line_order, cargo_name, quantity, unit,
              item_description, destination_port, destination_country, country_area,
              quantity_delivered, bl_figure, ship_figure,
              created_at, updated_at
       FROM export_bulking_cargo_lines
       WHERE shipment_id = $1
       ORDER BY line_order ASC, created_at ASC`,
      [shipmentId],
    );
    return result.rows;
  }

  async upsertCargoLines(shipmentId: string, lines: CargoLineDto[]): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results: unknown[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const order = line.line_order ?? i + 1;

        if (line.id) {
          const res = await client.query(
            `UPDATE export_bulking_cargo_lines SET
              line_order=$1, cargo_name=$2, quantity=$3, unit=$4,
              item_description=$5, destination_port=$6, destination_country=$7, country_area=$8,
              quantity_delivered=$9, bl_figure=$10, ship_figure=$11,
              updated_at=NOW()
             WHERE id=$12 AND shipment_id=$13
             RETURNING *`,
            [order, line.cargo_name, line.quantity ?? null, line.unit ?? null,
             line.item_description ?? null, line.destination_port ?? null,
             line.destination_country ?? null, line.country_area ?? null,
             line.quantity_delivered ?? null, line.bl_figure ?? null, line.ship_figure ?? null,
             line.id, shipmentId],
          );
          if (res.rows[0]) results.push(res.rows[0]);
        } else {
          const res = await client.query(
            `INSERT INTO export_bulking_cargo_lines
              (shipment_id, line_order, cargo_name, quantity, unit,
               item_description, destination_port, destination_country, country_area,
               quantity_delivered, bl_figure, ship_figure, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
             RETURNING *`,
            [shipmentId, order, line.cargo_name, line.quantity ?? null, line.unit ?? null,
             line.item_description ?? null, line.destination_port ?? null,
             line.destination_country ?? null, line.country_area ?? null,
             line.quantity_delivered ?? null, line.bl_figure ?? null, line.ship_figure ?? null],
          );
          if (res.rows[0]) results.push(res.rows[0]);
        }
      }

      await client.query("COMMIT");
      return results;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteCargoLine(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM export_bulking_cargo_lines WHERE id = $1`, [id]);
  }

  /* ───────── shipping instructions ───────── */

  async listShippingInstructions(shipmentId: string): Promise<unknown[]> {
    const siResult = await this.pool.query(
      `SELECT * FROM export_bulking_shipping_instructions WHERE shipment_id = $1 ORDER BY created_at ASC`,
      [shipmentId],
    );
    const sis = siResult.rows;
    for (const si of sis) {
      const lineResult = await this.pool.query(
        `SELECT * FROM export_bulking_si_lines WHERE si_id = $1 ORDER BY created_at ASC`,
        [(si as { id: string }).id],
      );
      (si as { lines: unknown[] }).lines = lineResult.rows;
    }
    return sis;
  }

  async createShippingInstruction(
    shipmentId: string,
    dto: ShippingInstructionDto,
    userId?: string | null,
  ): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const { year, month } = utcYearMonthNow();
      let siNumber = dto.si_number?.trim() ?? "";
      const holder = userId ?? null;
      if (!siNumber) {
        const serial = await this.allocateNextSerial(client, SERIES_SI_EUP, year, month);
        siNumber = formatSiDocumentNumber(year, month, serial);
      }

      const siRes = await client.query(
        `INSERT INTO export_bulking_shipping_instructions
          (shipment_id, si_number, messrs, bill_of_lading_option, consignee, notify_party,
           freight, shipper_snapshot, npwp, bl_indicated, doc_number_held_by_user_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
         RETURNING *`,
        [
          shipmentId,
          siNumber,
          dto.messrs ?? null,
          dto.bill_of_lading_option ?? null,
          dto.consignee ?? null,
          dto.notify_party ?? null,
          dto.freight ?? null,
          dto.shipper_snapshot ?? null,
          dto.npwp ?? null,
          dto.bl_indicated ?? null,
          holder,
        ],
      );
      const si = siRes.rows[0] as { id: string; lines?: unknown[] };
      si.lines = [];

      if (dto.lines?.length) {
        for (const line of dto.lines) {
          const lineRes = await client.query(
            `INSERT INTO export_bulking_si_lines
              (si_id, cargo_line_id, description_of_goods, quantity, bl_split_qty, destination_port, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
             RETURNING *`,
            [si.id, line.cargo_line_id ?? null, line.description_of_goods ?? null,
             line.quantity ?? null, line.bl_split_qty ?? null, line.destination_port ?? null],
          );
          if (lineRes.rows[0]) si.lines.push(lineRes.rows[0]);
        }
      }

      await client.query("COMMIT");
      return si;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async updateShippingInstruction(
    id: string,
    dto: ShippingInstructionDto,
    actingUserId?: string | null,
  ): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const prevRes = await client.query(
        `SELECT si_number, doc_number_held_by_user_id FROM export_bulking_shipping_instructions WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const prev = prevRes.rows[0] as
        | { si_number: string | null; doc_number_held_by_user_id: string | null }
        | undefined;
      if (!prev) {
        await client.query("ROLLBACK");
        return null;
      }

      let nextHolder = prev.doc_number_held_by_user_id;
      if (actingUserId && dto.si_number !== undefined) {
        const a = (prev.si_number ?? "").trim();
        const b = (dto.si_number ?? "").trim();
        if (a !== b) nextHolder = actingUserId;
      }

      const siRes = await client.query(
        `UPDATE export_bulking_shipping_instructions SET
          si_number=$1, messrs=$2, bill_of_lading_option=$3, consignee=$4, notify_party=$5,
          freight=$6, shipper_snapshot=$7, npwp=$8, bl_indicated=$9,
          doc_number_held_by_user_id=$10,
          updated_at=NOW()
         WHERE id=$11 RETURNING *`,
        [
          dto.si_number !== undefined ? (dto.si_number?.trim() || null) : prev.si_number,
          dto.messrs ?? null,
          dto.bill_of_lading_option ?? null,
          dto.consignee ?? null,
          dto.notify_party ?? null,
          dto.freight ?? null,
          dto.shipper_snapshot ?? null,
          dto.npwp ?? null,
          dto.bl_indicated ?? null,
          nextHolder,
          id,
        ],
      );
      const si = siRes.rows[0] as { id: string; lines?: unknown[] } | undefined;
      if (!si) {
        await client.query("ROLLBACK");
        return null;
      }

      if (dto.lines !== undefined) {
        await client.query(`DELETE FROM export_bulking_si_lines WHERE si_id = $1`, [id]);
        si.lines = [];
        if (dto.lines?.length) {
          for (const line of dto.lines) {
            const lineRes = await client.query(
              `INSERT INTO export_bulking_si_lines
                (si_id, cargo_line_id, description_of_goods, quantity, bl_split_qty, destination_port, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
               RETURNING *`,
              [id, line.cargo_line_id ?? null, line.description_of_goods ?? null,
               line.quantity ?? null, line.bl_split_qty ?? null, line.destination_port ?? null],
            );
            if (lineRes.rows[0]) si.lines.push(lineRes.rows[0]);
          }
        }
      } else {
        const lineResult = await client.query(
          `SELECT * FROM export_bulking_si_lines WHERE si_id = $1 ORDER BY created_at ASC`,
          [id],
        );
        si.lines = lineResult.rows;
      }

      await client.query("COMMIT");
      return si;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async regenerateShippingInstructionNumber(siId: string, userId: string): Promise<unknown | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query(
        `SELECT doc_number_held_by_user_id FROM export_bulking_shipping_instructions WHERE id = $1 FOR UPDATE`,
        [siId],
      );
      const row = cur.rows[0] as { doc_number_held_by_user_id: string | null } | undefined;
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      if (row.doc_number_held_by_user_id != null && row.doc_number_held_by_user_id !== userId) {
        await client.query("ROLLBACK");
        throw new AppError("Only the user who holds this document number can regenerate it", 403);
      }

      const { year, month } = utcYearMonthNow();
      let lastErr: unknown;
      for (let attempt = 0; attempt < 25; attempt++) {
        const serial = await this.allocateNextSerial(client, SERIES_SI_EUP, year, month);
        const siNumber = formatSiDocumentNumber(year, month, serial);
        try {
          const siRes = await client.query(
            `UPDATE export_bulking_shipping_instructions
             SET si_number = $1, doc_number_held_by_user_id = $2, updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [siNumber, userId, siId],
          );
          const si = siRes.rows[0] as { id: string; lines?: unknown[] } | undefined;
          if (!si) {
            await client.query("ROLLBACK");
            return null;
          }
          const lineResult = await client.query(
            `SELECT * FROM export_bulking_si_lines WHERE si_id = $1 ORDER BY created_at ASC`,
            [siId],
          );
          si.lines = lineResult.rows;
          await client.query("COMMIT");
          return si;
        } catch (e: unknown) {
          const code = (e as { code?: string }).code;
          if (code === "23505") {
            lastErr = e;
            continue;
          }
          await client.query("ROLLBACK");
          throw e;
        }
      }
      await client.query("ROLLBACK");
      throw lastErr ?? new AppError("Could not allocate a unique SI number", 409);
    } finally {
      client.release();
    }
  }

  async regenerateInvoiceNumber(invoiceId: string, userId: string): Promise<unknown | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query(
        `SELECT doc_number_held_by_user_id FROM export_bulking_invoices WHERE id = $1 FOR UPDATE`,
        [invoiceId],
      );
      const row = cur.rows[0] as { doc_number_held_by_user_id: string | null } | undefined;
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      if (row.doc_number_held_by_user_id != null && row.doc_number_held_by_user_id !== userId) {
        await client.query("ROLLBACK");
        throw new AppError("Only the user who holds this document number can regenerate it", 403);
      }

      const { year, month } = utcYearMonthNow();
      let lastErr: unknown;
      for (let attempt = 0; attempt < 25; attempt++) {
        const serial = await this.allocateNextSerial(client, SERIES_CI_EU, year, month);
        const invoiceNo = formatInvoiceDocumentNumber(year, month, serial);
        try {
          const invRes = await client.query(
            `UPDATE export_bulking_invoices
             SET invoice_no = $1, doc_number_held_by_user_id = $2, updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [invoiceNo, userId, invoiceId],
          );
          const inv = invRes.rows[0] as { id: string; lines?: unknown[] } | undefined;
          if (!inv) {
            await client.query("ROLLBACK");
            return null;
          }
          const lineResult = await client.query(
            `SELECT * FROM export_bulking_invoice_lines WHERE invoice_id = $1 ORDER BY item_no ASC, created_at ASC`,
            [invoiceId],
          );
          inv.lines = lineResult.rows;
          await client.query("COMMIT");
          return inv;
        } catch (e: unknown) {
          const code = (e as { code?: string }).code;
          if (code === "23505") {
            lastErr = e;
            continue;
          }
          await client.query("ROLLBACK");
          throw e;
        }
      }
      await client.query("ROLLBACK");
      throw lastErr ?? new AppError("Could not allocate a unique invoice number", 409);
    } finally {
      client.release();
    }
  }

  async regeneratePackingListNumber(packingListId: string, userId: string): Promise<unknown | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query(
        `SELECT doc_number_held_by_user_id FROM export_bulking_packing_lists WHERE id = $1 FOR UPDATE`,
        [packingListId],
      );
      const row = cur.rows[0] as { doc_number_held_by_user_id: string | null } | undefined;
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      if (row.doc_number_held_by_user_id != null && row.doc_number_held_by_user_id !== userId) {
        await client.query("ROLLBACK");
        throw new AppError("Only the user who holds this document number can regenerate it", 403);
      }

      const { year, month } = utcYearMonthNow();
      let lastErr: unknown;
      for (let attempt = 0; attempt < 25; attempt++) {
        const serial = await this.allocateNextSerial(client, SERIES_PL_EUP, year, month);
        const plNo = formatPlDocumentNumber(year, month, serial);
        try {
          const plRes = await client.query(
            `UPDATE export_bulking_packing_lists
             SET packing_list_number = $1, doc_number_held_by_user_id = $2, updated_at = NOW()
             WHERE id = $3
             RETURNING *`,
            [plNo, userId, packingListId],
          );
          const pl = plRes.rows[0] as { id: string; lines?: unknown[] } | undefined;
          if (!pl) {
            await client.query("ROLLBACK");
            return null;
          }
          const lineResult = await client.query(
            `SELECT * FROM export_bulking_packing_list_lines WHERE packing_list_id = $1 ORDER BY created_at ASC`,
            [packingListId],
          );
          pl.lines = lineResult.rows;
          await client.query("COMMIT");
          return pl;
        } catch (e: unknown) {
          const code = (e as { code?: string }).code;
          if (code === "23505") {
            lastErr = e;
            continue;
          }
          await client.query("ROLLBACK");
          throw e;
        }
      }
      await client.query("ROLLBACK");
      throw lastErr ?? new AppError("Could not allocate a unique packing list number", 409);
    } finally {
      client.release();
    }
  }

  async deleteShippingInstruction(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM export_bulking_si_lines WHERE si_id = $1`, [id]);
    await this.pool.query(`DELETE FROM export_bulking_shipping_instructions WHERE id = $1`, [id]);
  }

  /* ───────── invoices ───────── */

  async listInvoices(shipmentId: string): Promise<unknown[]> {
    const invResult = await this.pool.query(
      `SELECT * FROM export_bulking_invoices WHERE shipment_id = $1 ORDER BY created_at ASC`,
      [shipmentId],
    );
    const invoices = invResult.rows;
    for (const inv of invoices) {
      const lineResult = await this.pool.query(
        `SELECT * FROM export_bulking_invoice_lines WHERE invoice_id = $1 ORDER BY item_no ASC, created_at ASC`,
        [(inv as { id: string }).id],
      );
      (inv as { lines: unknown[] }).lines = lineResult.rows;
    }
    return invoices;
  }

  async createInvoice(shipmentId: string, dto: InvoiceDto, userId?: string | null): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const siId = dto.shipping_instruction_id ?? null;
      if (siId) {
        await assertShippingInstructionMatchesShipment(client, shipmentId, siId);
      }

      const { year, month } = utcYearMonthNow();
      let invoiceNo = dto.invoice_no?.trim() ?? "";
      const holder = userId ?? null;
      if (!invoiceNo) {
        const serial = await this.allocateNextSerial(client, SERIES_CI_EU, year, month);
        invoiceNo = formatInvoiceDocumentNumber(year, month, serial);
      }

      const invRes = await client.query(
        `INSERT INTO export_bulking_invoices
          (shipment_id, shipping_instruction_id, invoice_no, invoice_date, messrs, vessel_voyage_snapshot,
           loadport_snapshot, destination_snapshot, marks, doc_number_held_by_user_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
         RETURNING *`,
        [
          shipmentId,
          siId,
          invoiceNo,
          dto.invoice_date ?? null,
          dto.messrs ?? null,
          dto.vessel_voyage_snapshot ?? null,
          dto.loadport_snapshot ?? null,
          dto.destination_snapshot ?? null,
          dto.marks ?? null,
          holder,
        ],
      );
      const inv = invRes.rows[0] as { id: string; lines?: unknown[] };
      inv.lines = [];

      let linesToInsert = dto.lines ?? [];
      if (!linesToInsert.length && dto.cargo_line_id) {
        linesToInsert = [{ cargo_line_id: dto.cargo_line_id, item_no: 1 }];
      }

      if (linesToInsert.length) {
        for (const line of linesToInsert) {
          const lineRes = await client.query(
            `INSERT INTO export_bulking_invoice_lines
              (invoice_id, cargo_line_id, item_no, description_of_goods, contract_no, so_no,
               quantity, unit_price, total_amount, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
             RETURNING *`,
            [inv.id, line.cargo_line_id ?? null, line.item_no ?? null,
             line.description_of_goods ?? null, line.contract_no ?? null, line.so_no ?? null,
             line.quantity ?? null, line.unit_price ?? null, line.total_amount ?? null],
          );
          if (lineRes.rows[0]) inv.lines.push(lineRes.rows[0]);
        }
      }

      await client.query("COMMIT");
      return inv;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async updateInvoice(id: string, dto: InvoiceDto, actingUserId?: string | null): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const curRes = await client.query(
        `SELECT * FROM export_bulking_invoices WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const current = curRes.rows[0] as
        | {
            shipment_id: string;
            invoice_no: unknown;
            invoice_date: unknown;
            messrs: unknown;
            vessel_voyage_snapshot: unknown;
            loadport_snapshot: unknown;
            destination_snapshot: unknown;
            marks: unknown;
            shipping_instruction_id: unknown;
            doc_number_held_by_user_id: unknown;
          }
        | undefined;

      if (!current) {
        await client.query("ROLLBACK");
        return null;
      }

      const shipmentId = current.shipment_id;

      let nextShippingInstructionId: string | null;
      if (dto.shipping_instruction_id !== undefined) {
        nextShippingInstructionId =
          dto.shipping_instruction_id === null ? null : dto.shipping_instruction_id;
      } else {
        nextShippingInstructionId = (current.shipping_instruction_id as string | null) ?? null;
      }

      if (nextShippingInstructionId) {
        await assertShippingInstructionMatchesShipment(client, shipmentId, nextShippingInstructionId);
      }

      const invoice_no = dto.invoice_no !== undefined ? dto.invoice_no : current.invoice_no;
      const invoice_date = dto.invoice_date !== undefined ? dto.invoice_date : current.invoice_date;
      const messrs = dto.messrs !== undefined ? dto.messrs : current.messrs;
      const vessel_voyage_snapshot =
        dto.vessel_voyage_snapshot !== undefined ? dto.vessel_voyage_snapshot : current.vessel_voyage_snapshot;
      const loadport_snapshot =
        dto.loadport_snapshot !== undefined ? dto.loadport_snapshot : current.loadport_snapshot;
      const destination_snapshot =
        dto.destination_snapshot !== undefined ? dto.destination_snapshot : current.destination_snapshot;
      const marks = dto.marks !== undefined ? dto.marks : current.marks;

      let nextDocHolder = current.doc_number_held_by_user_id as string | null;
      const prevInvNo = String(current.invoice_no ?? "").trim();
      if (actingUserId && dto.invoice_no !== undefined) {
        const nextInvNo = String(dto.invoice_no ?? "").trim();
        if (prevInvNo !== nextInvNo) nextDocHolder = actingUserId;
      }

      const invRes = await client.query(
        `UPDATE export_bulking_invoices SET
          invoice_no=$1, invoice_date=$2, messrs=$3, vessel_voyage_snapshot=$4,
          loadport_snapshot=$5, destination_snapshot=$6, marks=$7,
          shipping_instruction_id=$8, doc_number_held_by_user_id=$9, updated_at=NOW()
         WHERE id=$10 RETURNING *`,
        [invoice_no, invoice_date, messrs, vessel_voyage_snapshot,
         loadport_snapshot, destination_snapshot, marks,
         nextShippingInstructionId, nextDocHolder, id],
      );
      const inv = invRes.rows[0] as { id: string; lines?: unknown[] } | undefined;
      if (!inv) {
        await client.query("ROLLBACK");
        return null;
      }

      if (dto.lines !== undefined) {
        await client.query(`DELETE FROM export_bulking_invoice_lines WHERE invoice_id = $1`, [id]);
        inv.lines = [];
        if (dto.lines.length) {
          for (const line of dto.lines) {
            const lineRes = await client.query(
              `INSERT INTO export_bulking_invoice_lines
                (invoice_id, cargo_line_id, item_no, description_of_goods, contract_no, so_no,
                 quantity, unit_price, total_amount, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
               RETURNING *`,
              [id, line.cargo_line_id ?? null, line.item_no ?? null,
               line.description_of_goods ?? null, line.contract_no ?? null, line.so_no ?? null,
               line.quantity ?? null, line.unit_price ?? null, line.total_amount ?? null],
            );
            if (lineRes.rows[0]) inv.lines.push(lineRes.rows[0]);
          }
        }
      } else {
        const lineResult = await client.query(
          `SELECT * FROM export_bulking_invoice_lines WHERE invoice_id = $1 ORDER BY item_no ASC, created_at ASC`,
          [id],
        );
        inv.lines = lineResult.rows;
      }

      await client.query("COMMIT");
      return inv;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteInvoice(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM export_bulking_invoice_lines WHERE invoice_id = $1`, [id]);
    await this.pool.query(`DELETE FROM export_bulking_invoices WHERE id = $1`, [id]);
  }

  /* ───────── packing lists ───────── */

  async listPackingLists(shipmentId: string): Promise<unknown[]> {
    const plResult = await this.pool.query(
      `SELECT * FROM export_bulking_packing_lists WHERE shipment_id = $1 ORDER BY created_at ASC`,
      [shipmentId],
    );
    const lists = plResult.rows;
    for (const pl of lists) {
      const lineResult = await this.pool.query(
        `SELECT * FROM export_bulking_packing_list_lines WHERE packing_list_id = $1 ORDER BY created_at ASC`,
        [(pl as { id: string }).id],
      );
      (pl as { lines: unknown[] }).lines = lineResult.rows;
    }
    return lists;
  }

  async createPackingList(shipmentId: string, dto: PackingListDto, userId?: string | null): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const { year, month } = utcYearMonthNow();
      let plNumber = dto.packing_list_number?.trim() ?? "";
      const holder = userId ?? null;
      if (!plNumber) {
        const serial = await this.allocateNextSerial(client, SERIES_PL_EUP, year, month);
        plNumber = formatPlDocumentNumber(year, month, serial);
      }

      const plRes = await client.query(
        `INSERT INTO export_bulking_packing_lists
          (shipment_id, packing_list_number, loadport_snapshot, destination_snapshot, doc_number_held_by_user_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
         RETURNING *`,
        [shipmentId, plNumber,
         dto.loadport_snapshot ?? null, dto.destination_snapshot ?? null, holder],
      );
      const pl = plRes.rows[0] as { id: string; lines?: unknown[] };
      pl.lines = [];

      if (dto.lines?.length) {
        for (const line of dto.lines) {
          const lineRes = await client.query(
            `INSERT INTO export_bulking_packing_list_lines
              (packing_list_id, cargo_line_id, description_of_goods, quantity,
               destination_snapshot, packing, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
             RETURNING *`,
            [pl.id, line.cargo_line_id ?? null, line.description_of_goods ?? null,
             line.quantity ?? null, line.destination_snapshot ?? null, line.packing ?? null],
          );
          if (lineRes.rows[0]) pl.lines.push(lineRes.rows[0]);
        }
      }

      await client.query("COMMIT");
      return pl;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async updatePackingList(id: string, dto: PackingListDto, actingUserId?: string | null): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const prevRes = await client.query(
        `SELECT packing_list_number, loadport_snapshot, destination_snapshot, doc_number_held_by_user_id
         FROM export_bulking_packing_lists WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const prev = prevRes.rows[0] as
        | {
            packing_list_number: string | null;
            loadport_snapshot: string | null;
            destination_snapshot: string | null;
            doc_number_held_by_user_id: string | null;
          }
        | undefined;
      if (!prev) {
        await client.query("ROLLBACK");
        return null;
      }

      let nextHolder = prev.doc_number_held_by_user_id;
      if (actingUserId && dto.packing_list_number !== undefined) {
        const a = (prev.packing_list_number ?? "").trim();
        const b = (dto.packing_list_number ?? "").trim();
        if (a !== b) nextHolder = actingUserId;
      }

      const loadport =
        dto.loadport_snapshot !== undefined ? dto.loadport_snapshot : prev.loadport_snapshot;
      const dest =
        dto.destination_snapshot !== undefined ? dto.destination_snapshot : prev.destination_snapshot;

      const plRes = await client.query(
        `UPDATE export_bulking_packing_lists SET
          packing_list_number=$1, loadport_snapshot=$2, destination_snapshot=$3,
          doc_number_held_by_user_id=$4, updated_at=NOW()
         WHERE id=$5 RETURNING *`,
        [
          dto.packing_list_number !== undefined ? (dto.packing_list_number?.trim() || null) : prev.packing_list_number,
          loadport,
          dest,
          nextHolder,
          id,
        ],
      );
      const pl = plRes.rows[0] as { id: string; lines?: unknown[] } | undefined;
      if (!pl) {
        await client.query("ROLLBACK");
        return null;
      }

      if (dto.lines !== undefined) {
        await client.query(`DELETE FROM export_bulking_packing_list_lines WHERE packing_list_id = $1`, [id]);
        pl.lines = [];
        if (dto.lines?.length) {
          for (const line of dto.lines) {
            const lineRes = await client.query(
              `INSERT INTO export_bulking_packing_list_lines
                (packing_list_id, cargo_line_id, description_of_goods, quantity,
                 destination_snapshot, packing, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
               RETURNING *`,
              [id, line.cargo_line_id ?? null, line.description_of_goods ?? null,
               line.quantity ?? null, line.destination_snapshot ?? null, line.packing ?? null],
            );
            if (lineRes.rows[0]) pl.lines.push(lineRes.rows[0]);
          }
        }
      } else {
        const lineResult = await client.query(
          `SELECT * FROM export_bulking_packing_list_lines WHERE packing_list_id = $1 ORDER BY created_at ASC`,
          [id],
        );
        pl.lines = lineResult.rows;
      }

      await client.query("COMMIT");
      return pl;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async deletePackingList(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM export_bulking_packing_list_lines WHERE packing_list_id = $1`, [id]);
    await this.pool.query(`DELETE FROM export_bulking_packing_lists WHERE id = $1`, [id]);
  }
}
