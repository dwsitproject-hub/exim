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
  parseExportDocumentSerial,
} from "../utils/document-numbers.js";
import type {
  CreateExportBulkingShipmentDto,
  UpdateExportBulkingShipmentDto,
  ListExportBulkingQuery,
  ExportBulkingShipmentRow,
  ExportBulkingListFilterOptions,
  CargoLineDto,
  SapLineDto,
  BillingLineDto,
  BillOfLadingDto,
  SiPebFieldsDto,
  ShippingInstructionDto,
  SiLineDto,
  InvoiceDto,
  InvoiceLineDto,
  PackingListDto,
  PackingListLineDto,
} from "../dto/index.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import {
  assertUniqueExportDocumentNumber,
  INVOICE_NUMBER_SPEC,
  PACKING_LIST_NUMBER_SPEC,
  rethrowDocumentNumberConflict,
  SI_NUMBER_SPEC,
  trimDocNumber,
} from "../utils/document-number-uniqueness.js";

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

const LAYCAN_LABEL_SQL = `CASE
  WHEN s.laycan_from IS NOT NULL AND s.laycan_to IS NOT NULL THEN
    trim(to_char(s.laycan_from AT TIME ZONE 'UTC', 'DD Mon')) || ' — ' || trim(to_char(s.laycan_to AT TIME ZONE 'UTC', 'DD Mon'))
  WHEN btrim(coalesce(s.laycan,'')) <> '' THEN btrim(s.laycan)
  WHEN s.laycan_from IS NOT NULL THEN trim(to_char(s.laycan_from AT TIME ZONE 'UTC', 'DD Mon'))
  WHEN s.laycan_to IS NOT NULL THEN trim(to_char(s.laycan_to AT TIME ZONE 'UTC', 'DD Mon'))
  ELSE NULL
END`;

const CARGO_READINESS_LABEL_SQL = `CASE
  WHEN s.est_cargo_readiness IS NOT NULL THEN
    trim(to_char(s.est_cargo_readiness AT TIME ZONE 'UTC', 'DD Mon')) ||
    CASE WHEN btrim(coalesce(s.est_cargo_readiness_period,'')) <> ''
      THEN ' ' || btrim(s.est_cargo_readiness_period) ELSE '' END
  ELSE NULL
END`;

const TOTAL_QTY_LABEL_SQL = `to_char(
  ROUND(COALESCE(
    NULLIF((SELECT SUM(cl.quantity) FROM export_bulking_cargo_lines cl WHERE cl.shipment_id = s.id), 0),
    s.total_quantity
  ))::bigint, 'FM999,999,999,990')`;

const ETA_DATE_SQL = `to_char((COALESCE(s.ata, s.eta) AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')`;

const DEMURRAGE_RATE_LABEL_SQL = `trim(to_char(s.demurrage_rate_pdpr, 'FM999999990.00'))`;

const CARGO_LINE_LABEL_SQL = `trim(coalesce(nullif(btrim(cl.cargo_name),''), nullif(btrim(cl.item_description),''), 'Cargo')) ||
  CASE WHEN cl.quantity IS NOT NULL
    THEN ' ' || to_char(ROUND(cl.quantity)::bigint, 'FM999,999,999,990') || ' MT'
    ELSE '' END`;

function appendTextArrayFilter(
  conditions: string[],
  params: unknown[],
  idx: number,
  expr: string,
  values: string[] | undefined,
): number {
  const list = [...new Set((values ?? []).map((v) => v.trim()).filter(Boolean))];
  if (list.length === 1) {
    conditions.push(`${expr} = $${idx}`);
    params.push(list[0]);
    return idx + 1;
  }
  if (list.length > 1) {
    conditions.push(`${expr} = ANY($${idx}::text[])`);
    params.push(list);
    return idx + 1;
  }
  return idx;
}

const SHIPMENT_COLUMNS = `id, shipment_no, current_status, vessel_name, voyage_number, shipper,
  loadport_name, received_nomination, received_shipping_instruction,
  incoterms, laycan, laycan_from, laycan_to, est_cargo_readiness, est_cargo_readiness_period,
  length_over_all,
  eta, ata, nor, etb, atb, commence_loading,
  etc, atc, hose_on, hose_off, bl_figure, ship_figure, npe_date,
  quantity_spb, spb, delivery_order_pgi, spr, bill_of_lading_no, bill_of_lading_date,
  bill_of_lading_nn_obl, sent_bl, sent_coo, sent_phyto, sent_hc, sent_sr,
  sent_sustainability, present_docs, required_sent_documents, peb_request_no, peb_no, peb_date, pe_no, pe_date,
  hs_code, currency_tax, biaya_keluar_price_usd_mt, biaya_keluar_amount_idr, biaya_keluar_billing_no,
  levy_price_usd_mt, levy_amount_idr, levy_billing_no, billing_to_gl, td,
  surveyor, surveyor_reason, agent, laytime_rate_mtph, demurrage_rate_pdpr, total_quantity,
  remarks, created_by, documentation_assigned_to, documentation_assigned_at, documentation_assigned_by,
  created_at, updated_at`;

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

  /** Monotonic per (series, year); must run inside an open transaction. */
  private async allocateNextSerial(
    client: PoolClient,
    seriesCode: string,
    year: number,
  ): Promise<number> {
    const r = await client.query<{ last_serial: number }>(
      `INSERT INTO export_bulking_doc_number_counters (series_code, year, last_serial)
       VALUES ($1, $2, 1)
       ON CONFLICT (series_code, year)
       DO UPDATE SET
         last_serial = export_bulking_doc_number_counters.last_serial + 1,
         updated_at = NOW()
       RETURNING last_serial`,
      [seriesCode, year],
    );
    return Number(r.rows[0]?.last_serial ?? 0);
  }

  /**
   * When the deleted document held the latest auto-allocated serial for its year,
   * roll the counter back so the next create reuses that number.
   */
  private async releaseSerialIfLast(
    client: PoolClient,
    seriesCode: string,
    docNumber: string | null | undefined,
  ): Promise<void> {
    const parsed = parseExportDocumentSerial(docNumber);
    if (!parsed) return;

    await client.query(
      `UPDATE export_bulking_doc_number_counters
       SET last_serial = last_serial - 1, updated_at = NOW()
       WHERE series_code = $1 AND year = $2 AND last_serial = $3`,
      [seriesCode, parsed.year, parsed.serial],
    );
  }

  /* ───────── CRUD shipment ───────── */

  async create(dto: CreateExportBulkingShipmentDto, userId?: string): Promise<ExportBulkingShipmentRow> {
    const shipmentNo = await this.generateShipmentNo();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<ExportBulkingShipmentRow>(
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
      const shipment = result.rows[0];
      if (!shipment) throw new Error("ExportBulkingRepository.create: no row returned");

      const cargoLines = dto.cargo_lines ?? [];
      for (let i = 0; i < cargoLines.length; i++) {
        const line = cargoLines[i];
        await client.query(
          `INSERT INTO export_bulking_cargo_lines
            (shipment_id, line_order, cargo_name, quantity, unit,
             item_description, destination_port, destination_country, country_area,
             quantity_delivered, bl_figure, ship_figure, pe_no, pe_date, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())`,
          [
            shipment.id,
            i + 1,
            line.cargo_name,
            line.quantity ?? null,
            "MT",
            line.item_description ?? null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
          ],
        );
      }

      await client.query("COMMIT");
      return shipment;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
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

    idx = appendTextArrayFilter(conditions, params, idx, "s.shipment_no", query.shipment_nos);
    idx = appendTextArrayFilter(conditions, params, idx, "TRIM(COALESCE(s.vessel_name, ''))", query.vessel_names);
    idx = appendTextArrayFilter(conditions, params, idx, "TRIM(COALESCE(s.voyage_number, ''))", query.voyage_numbers);
    idx = appendTextArrayFilter(conditions, params, idx, "TRIM(COALESCE(s.shipper, ''))", query.shippers);
    idx = appendTextArrayFilter(conditions, params, idx, "TRIM(COALESCE(s.loadport_name, ''))", query.loadport_names);
    idx = appendTextArrayFilter(conditions, params, idx, "TRIM(COALESCE(s.peb_no, ''))", query.peb_nos);
    idx = appendTextArrayFilter(conditions, params, idx, "TRIM(COALESCE(s.bill_of_lading_no, ''))", query.bl_nos);

    if (query.cargo_names?.length) {
      const names = [...new Set(query.cargo_names.map((v) => v.trim()).filter(Boolean))];
      if (names.length === 1) {
        conditions.push(`EXISTS (
          SELECT 1 FROM export_bulking_cargo_lines cl
          WHERE cl.shipment_id = s.id AND TRIM(COALESCE(cl.cargo_name, '')) = $${idx++}
        )`);
        params.push(names[0]);
      } else if (names.length > 1) {
        conditions.push(`EXISTS (
          SELECT 1 FROM export_bulking_cargo_lines cl
          WHERE cl.shipment_id = s.id AND TRIM(COALESCE(cl.cargo_name, '')) = ANY($${idx++}::text[])
        )`);
        params.push(names);
      }
    }

    if (query.cargo_line_labels?.length) {
      const labels = [...new Set(query.cargo_line_labels.map((v) => v.trim()).filter(Boolean))];
      if (labels.length === 1) {
        conditions.push(`EXISTS (
          SELECT 1 FROM export_bulking_cargo_lines cl
          WHERE cl.shipment_id = s.id AND (${CARGO_LINE_LABEL_SQL}) = $${idx++}
        )`);
        params.push(labels[0]);
      } else if (labels.length > 1) {
        conditions.push(`EXISTS (
          SELECT 1 FROM export_bulking_cargo_lines cl
          WHERE cl.shipment_id = s.id AND (${CARGO_LINE_LABEL_SQL}) = ANY($${idx++}::text[])
        )`);
        params.push(labels);
      }
    }

    idx = appendTextArrayFilter(conditions, params, idx, TOTAL_QTY_LABEL_SQL, query.total_qty_labels);
    idx = appendTextArrayFilter(conditions, params, idx, LAYCAN_LABEL_SQL, query.laycan_labels);
    idx = appendTextArrayFilter(conditions, params, idx, CARGO_READINESS_LABEL_SQL, query.cargo_readiness_labels);
    idx = appendTextArrayFilter(conditions, params, idx, DEMURRAGE_RATE_LABEL_SQL, query.demurrage_rate_labels);
    idx = appendTextArrayFilter(conditions, params, idx, ETA_DATE_SQL, query.eta_dates);
    idx = appendTextArrayFilter(conditions, params, idx, "to_char((s.peb_date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')", query.peb_dates);
    idx = appendTextArrayFilter(conditions, params, idx, "to_char((s.bill_of_lading_date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')", query.bl_dates);

    if (query.si_numbers?.length) {
      const nums = [...new Set(query.si_numbers.map((v) => v.trim()).filter(Boolean))];
      conditions.push(`EXISTS (
        SELECT 1 FROM export_bulking_shipping_instructions si
        WHERE si.shipment_id = s.id AND TRIM(COALESCE(si.si_number, '')) = ANY($${idx++}::text[])
      )`);
      params.push(nums);
    }

    if (query.invoice_numbers?.length) {
      const nums = [...new Set(query.invoice_numbers.map((v) => v.trim()).filter(Boolean))];
      conditions.push(`EXISTS (
        SELECT 1 FROM export_bulking_invoices inv
        WHERE inv.shipment_id = s.id AND TRIM(COALESCE(inv.invoice_no, '')) = ANY($${idx++}::text[])
      )`);
      params.push(nums);
    }

    if (query.pl_numbers?.length) {
      const nums = [...new Set(query.pl_numbers.map((v) => v.trim()).filter(Boolean))];
      conditions.push(`EXISTS (
        SELECT 1 FROM export_bulking_packing_lists pl
        WHERE pl.shipment_id = s.id AND TRIM(COALESCE(pl.packing_list_number, '')) = ANY($${idx++}::text[])
      )`);
      params.push(nums);
    }

    if (query.pic_documentation_names?.length) {
      const names = [...new Set(query.pic_documentation_names.map((v) => v.trim()).filter(Boolean))];
      const wantsUnassigned = names.includes("Unassigned");
      const assigned = names.filter((n) => n !== "Unassigned");
      const parts: string[] = [];
      if (wantsUnassigned) parts.push("s.documentation_assigned_to IS NULL");
      if (assigned.length === 1) {
        parts.push(`EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = s.documentation_assigned_to AND TRIM(COALESCE(u.name, '')) = $${idx}
        )`);
        params.push(assigned[0]);
        idx++;
      } else if (assigned.length > 1) {
        parts.push(`EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = s.documentation_assigned_to AND TRIM(COALESCE(u.name, '')) = ANY($${idx}::text[])
        )`);
        params.push(assigned);
        idx++;
      }
      if (parts.length === 1) conditions.push(parts[0]);
      else if (parts.length > 1) conditions.push(`(${parts.join(" OR ")})`);
    }

    if (query.assignment_filter === "unassigned") {
      conditions.push("s.documentation_assigned_to IS NULL");
    } else if (
      query.assignment_filter === "assigned_to_me" &&
      query.documentation_assignee_id
    ) {
      conditions.push(`s.documentation_assigned_to = $${idx++}`);
      params.push(query.documentation_assignee_id);
    }

    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(`(
        s.shipment_no ILIKE $${idx}
        OR s.vessel_name ILIKE $${idx}
        OR s.shipper ILIKE $${idx}
        OR s.peb_no ILIKE $${idx}
        OR s.bill_of_lading_no ILIKE $${idx}
        OR s.current_status ILIKE $${idx}
        OR CAST(s.total_quantity AS TEXT) ILIKE $${idx}
        OR to_char(s.peb_date, 'YYYY-MM-DD') ILIKE $${idx}
        OR to_char(s.bill_of_lading_date, 'YYYY-MM-DD') ILIKE $${idx}
        OR EXISTS (
          SELECT 1 FROM export_bulking_cargo_lines cl
          WHERE cl.shipment_id = s.id
            AND (cl.cargo_name ILIKE $${idx} OR cl.item_description ILIKE $${idx})
        )
        OR EXISTS (
          SELECT 1 FROM export_bulking_shipping_instructions si
          WHERE si.shipment_id = s.id AND si.si_number ILIKE $${idx}
        )
        OR EXISTS (
          SELECT 1 FROM export_bulking_invoices inv
          WHERE inv.shipment_id = s.id AND inv.invoice_no ILIKE $${idx}
        )
        OR EXISTS (
          SELECT 1 FROM export_bulking_packing_lists pl
          WHERE pl.shipment_id = s.id AND pl.packing_list_number ILIKE $${idx}
        )
        OR EXISTS (
          SELECT 1 FROM users doc_search
          WHERE doc_search.id = s.documentation_assigned_to
            AND doc_search.name ILIKE $${idx}
        )
      )`);
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
      peb_no: "s.peb_no",
      peb_date: "s.peb_date",
      bill_of_lading_no: "s.bill_of_lading_no",
      laycan_from: "s.laycan_from",
      est_cargo_readiness: "s.est_cargo_readiness",
      demurrage_rate_pdpr: "s.demurrage_rate_pdpr",
    };
    const sortExpr = (query.sort_by && allowedSorts[query.sort_by]) ?? "s.created_at";
    const orderBy = `ORDER BY ${sortExpr} ${dir} NULLS LAST, s.id DESC`;

    params.push(limit, offset);
    const result = await this.pool.query<ExportBulkingShipmentRow>(
      `SELECT ${SHIPMENT_COLUMNS},
        (SELECT u.name FROM users u WHERE u.id = s.documentation_assigned_to) AS documentation_assignee_name,
        (SELECT COUNT(*)::int FROM export_bulking_cargo_lines cl WHERE cl.shipment_id = s.id) AS cargo_count,
        (SELECT json_agg(json_build_object(
            'cargo_name', cl2.cargo_name,
            'quantity', cl2.quantity,
            'item_description', cl2.item_description,
            'destination_port', cl2.destination_port
         ) ORDER BY cl2.line_order)
         FROM export_bulking_cargo_lines cl2 WHERE cl2.shipment_id = s.id
        ) AS cargo_summaries,
        (SELECT array_agg(DISTINCT cl4.cargo_name ORDER BY cl4.cargo_name)
         FROM export_bulking_cargo_lines cl4
         WHERE cl4.shipment_id = s.id AND btrim(cl4.cargo_name) <> ''
        ) AS cargo_names,
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
      `SELECT ${SHIPMENT_COLUMNS},
        (SELECT u.name FROM users u WHERE u.id = s.documentation_assigned_to) AS documentation_assignee_name
       FROM export_bulking_shipments s WHERE s.id = $1 AND s.deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async listDocumentationAssignees(): Promise<{ id: string; name: string; email: string }[]> {
    const result = await this.pool.query<{ id: string; name: string; email: string }>(
      `SELECT id, name, email
       FROM users
       WHERE is_active = true
         AND UPPER(TRIM(role)) = 'EXPORT_BULKING_DOCUMENT'
       ORDER BY name ASC, email ASC`,
    );
    return result.rows;
  }

  async assignDocumentation(
    shipmentId: string,
    assigneeUserId: string | null,
    assignedByUserId: string,
  ): Promise<ExportBulkingShipmentRow | null> {
    if (assigneeUserId) {
      const userCheck = await this.pool.query<{ id: string }>(
        `SELECT id FROM users
         WHERE id = $1 AND is_active = true
           AND UPPER(TRIM(role)) = 'EXPORT_BULKING_DOCUMENT'`,
        [assigneeUserId],
      );
      if (!userCheck.rows[0]) {
        throw new AppError("Assignee must be an active export bulking documentation officer", 400);
      }
    }

    const result = await this.pool.query<ExportBulkingShipmentRow>(
      `UPDATE export_bulking_shipments
       SET documentation_assigned_to = $1::uuid,
           documentation_assigned_at = CASE WHEN $1 IS NULL THEN NULL ELSE NOW() END,
           documentation_assigned_by = CASE WHEN $1 IS NULL THEN NULL ELSE $2::uuid END,
           updated_at = NOW()
       WHERE id = $3::uuid AND deleted_at IS NULL
       RETURNING ${SHIPMENT_COLUMNS}`,
      [assigneeUserId, assignedByUserId, shipmentId],
    );
    const row = result.rows[0] ?? null;
    if (!row) return null;

    const nameResult = await this.pool.query<{ name: string | null }>(
      `SELECT name FROM users WHERE id = $1`,
      [assigneeUserId],
    );
    return {
      ...row,
      documentation_assignee_name: assigneeUserId ? nameResult.rows[0]?.name ?? null : null,
    };
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
      "etc", "atc", "hose_on", "hose_off", "bl_figure", "ship_figure", "npe_date",
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
      "length_over_all", "laytime_rate_mtph", "demurrage_rate_pdpr", "total_quantity",
    ];
    for (const field of numericFields) {
      if (dto[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        params.push(dto[field]);
      }
    }

    if (dto.required_sent_documents !== undefined) {
      updates.push(`required_sent_documents = $${idx++}::jsonb`);
      params.push(JSON.stringify(dto.required_sent_documents));
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

  async listFilterOptions(): Promise<ExportBulkingListFilterOptions> {
    const [
      statusRes,
      shipmentNoRes,
      vesselRes,
      voyageRes,
      shipperRes,
      loadportRes,
      cargoNameRes,
      cargoLineRes,
      totalQtyRes,
      laycanRes,
      cargoReadinessRes,
      demurrageRes,
      etaRes,
      picRes,
      siRes,
      invoiceRes,
      plRes,
      pebNoRes,
      pebDateRes,
      blNoRes,
      blDateRes,
      statusCountRes,
    ] = await Promise.all([
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT current_status AS v FROM export_bulking_shipments WHERE deleted_at IS NULL ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT shipment_no AS v FROM export_bulking_shipments WHERE deleted_at IS NULL ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(vessel_name,'')) AS v FROM export_bulking_shipments
         WHERE deleted_at IS NULL AND TRIM(COALESCE(vessel_name,'')) <> '' ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(voyage_number,'')) AS v FROM export_bulking_shipments
         WHERE deleted_at IS NULL AND TRIM(COALESCE(voyage_number,'')) <> '' ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(shipper,'')) AS v FROM export_bulking_shipments
         WHERE deleted_at IS NULL AND TRIM(COALESCE(shipper,'')) <> '' ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(loadport_name,'')) AS v FROM export_bulking_shipments
         WHERE deleted_at IS NULL AND TRIM(COALESCE(loadport_name,'')) <> '' ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(cl.cargo_name,'')) AS v
         FROM export_bulking_cargo_lines cl
         INNER JOIN export_bulking_shipments s ON s.id = cl.shipment_id AND s.deleted_at IS NULL
         WHERE TRIM(COALESCE(cl.cargo_name,'')) <> ''
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT (${CARGO_LINE_LABEL_SQL}) AS v
         FROM export_bulking_cargo_lines cl
         INNER JOIN export_bulking_shipments s ON s.id = cl.shipment_id AND s.deleted_at IS NULL
         WHERE (${CARGO_LINE_LABEL_SQL}) IS NOT NULL AND btrim((${CARGO_LINE_LABEL_SQL})) <> ''
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT (${TOTAL_QTY_LABEL_SQL}) AS v
         FROM export_bulking_shipments s
         WHERE s.deleted_at IS NULL
           AND (${TOTAL_QTY_LABEL_SQL}) IS NOT NULL
           AND btrim((${TOTAL_QTY_LABEL_SQL})) <> ''
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT (${LAYCAN_LABEL_SQL}) AS v
         FROM export_bulking_shipments s
         WHERE s.deleted_at IS NULL
           AND (${LAYCAN_LABEL_SQL}) IS NOT NULL
           AND btrim((${LAYCAN_LABEL_SQL})) <> ''
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT (${CARGO_READINESS_LABEL_SQL}) AS v
         FROM export_bulking_shipments s
         WHERE s.deleted_at IS NULL
           AND (${CARGO_READINESS_LABEL_SQL}) IS NOT NULL
           AND btrim((${CARGO_READINESS_LABEL_SQL})) <> ''
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT (${DEMURRAGE_RATE_LABEL_SQL}) AS v
         FROM export_bulking_shipments s
         WHERE s.deleted_at IS NULL
           AND s.demurrage_rate_pdpr IS NOT NULL
           AND btrim((${DEMURRAGE_RATE_LABEL_SQL})) <> ''
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT (${ETA_DATE_SQL}) AS v
         FROM export_bulking_shipments s
         WHERE s.deleted_at IS NULL AND COALESCE(s.ata, s.eta) IS NOT NULL
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(u.name, 'Unassigned')) AS v
         FROM export_bulking_shipments s
         LEFT JOIN users u ON u.id = s.documentation_assigned_to
         WHERE s.deleted_at IS NULL
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(si.si_number,'')) AS v
         FROM export_bulking_shipping_instructions si
         INNER JOIN export_bulking_shipments s ON s.id = si.shipment_id AND s.deleted_at IS NULL
         WHERE TRIM(COALESCE(si.si_number,'')) <> ''
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(inv.invoice_no,'')) AS v
         FROM export_bulking_invoices inv
         INNER JOIN export_bulking_shipments s ON s.id = inv.shipment_id AND s.deleted_at IS NULL
         WHERE TRIM(COALESCE(inv.invoice_no,'')) <> ''
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(pl.packing_list_number,'')) AS v
         FROM export_bulking_packing_lists pl
         INNER JOIN export_bulking_shipments s ON s.id = pl.shipment_id AND s.deleted_at IS NULL
         WHERE TRIM(COALESCE(pl.packing_list_number,'')) <> ''
         ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(peb_no,'')) AS v FROM export_bulking_shipments
         WHERE deleted_at IS NULL AND TRIM(COALESCE(peb_no,'')) <> '' ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT to_char((peb_date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS v
         FROM export_bulking_shipments WHERE deleted_at IS NULL AND peb_date IS NOT NULL ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(bill_of_lading_no,'')) AS v FROM export_bulking_shipments
         WHERE deleted_at IS NULL AND TRIM(COALESCE(bill_of_lading_no,'')) <> '' ORDER BY v`,
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT to_char((bill_of_lading_date AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS v
         FROM export_bulking_shipments WHERE deleted_at IS NULL AND bill_of_lading_date IS NOT NULL ORDER BY v`,
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
      shipment_nos: shipmentNoRes.rows.map((r) => r.v),
      vessel_names: vesselRes.rows.map((r) => r.v),
      voyage_numbers: voyageRes.rows.map((r) => r.v),
      shippers: shipperRes.rows.map((r) => r.v),
      loadport_names: loadportRes.rows.map((r) => r.v),
      cargo_names: cargoNameRes.rows.map((r) => r.v),
      cargo_line_labels: cargoLineRes.rows.map((r) => r.v),
      total_qty_labels: totalQtyRes.rows.map((r) => r.v),
      laycan_labels: laycanRes.rows.map((r) => r.v),
      cargo_readiness_labels: cargoReadinessRes.rows.map((r) => r.v),
      demurrage_rate_labels: demurrageRes.rows.map((r) => r.v),
      eta_dates: etaRes.rows.map((r) => r.v),
      pic_documentation_names: picRes.rows.map((r) => r.v),
      si_numbers: siRes.rows.map((r) => r.v),
      invoice_numbers: invoiceRes.rows.map((r) => r.v),
      pl_numbers: plRes.rows.map((r) => r.v),
      peb_nos: pebNoRes.rows.map((r) => r.v),
      peb_dates: pebDateRes.rows.map((r) => r.v),
      bl_nos: blNoRes.rows.map((r) => r.v),
      bl_dates: blDateRes.rows.map((r) => r.v),
      status_counts: statusCounts,
    };
  }

  async getStatusEvents(shipmentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT id, shipment_id, old_status, new_status, changed_by, changed_at, remarks
       FROM export_bulking_status_events
       WHERE shipment_id = $1
       ORDER BY changed_at DESC`,
      [shipmentId],
    );
    return result.rows;
  }

  /* ───────── cargo lines ───────── */

  async listCargoLines(shipmentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT id, shipment_id, line_order, cargo_name, quantity, unit,
              item_description, destination_port, destination_country, country_area,
              quantity_delivered, bl_figure, ship_figure, reconciliation_remarks,
              pe_no, pe_date,
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
              reconciliation_remarks=$12,
              pe_no=$13, pe_date=$14,
              updated_at=NOW()
             WHERE id=$15 AND shipment_id=$16
             RETURNING *`,
            [order, line.cargo_name, line.quantity ?? null, line.unit ?? null,
             line.item_description ?? null, line.destination_port ?? null,
             line.destination_country ?? null, line.country_area ?? null,
             line.quantity_delivered ?? null, line.bl_figure ?? null, line.ship_figure ?? null,
             line.reconciliation_remarks?.trim() || null,
             line.pe_no?.trim() || null,
             line.pe_date ? new Date(line.pe_date) : null,
             line.id, shipmentId],
          );
          if (res.rows[0]) {
            results.push(res.rows[0]);
          } else {
            throw new AppError(`Cargo line ${line.id} not found for this shipment`, 400);
          }
        } else {
          const res = await client.query(
            `INSERT INTO export_bulking_cargo_lines
              (shipment_id, line_order, cargo_name, quantity, unit,
               item_description, destination_port, destination_country, country_area,
               quantity_delivered, bl_figure, ship_figure, reconciliation_remarks,
               pe_no, pe_date, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
             RETURNING *`,
            [shipmentId, order, line.cargo_name, line.quantity ?? null, line.unit ?? null,
             line.item_description ?? null, line.destination_port ?? null,
             line.destination_country ?? null, line.country_area ?? null,
             line.quantity_delivered ?? null, line.bl_figure ?? null, line.ship_figure ?? null,
             line.reconciliation_remarks?.trim() || null,
             line.pe_no?.trim() || null,
             line.pe_date ? new Date(line.pe_date) : null],
          );
          if (res.rows[0]) results.push(res.rows[0]);
        }
      }

      await this.syncShipmentTotalQuantity(client, shipmentId);
      await client.query("COMMIT");
      return results;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteCargoLine(shipmentId: string, cargoId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        `DELETE FROM export_bulking_cargo_lines WHERE id = $1 AND shipment_id = $2`,
        [cargoId, shipmentId],
      );
      if (r.rowCount === 0) {
        throw new AppError("Cargo line not found", 404);
      }
      await this.syncShipmentTotalQuantity(client, shipmentId);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /** Keep shipment.total_quantity aligned with sum of cargo line quantities. */
  private async syncShipmentTotalQuantity(client: PoolClient, shipmentId: string): Promise<void> {
    await client.query(
      `UPDATE export_bulking_shipments s SET
        total_quantity = sub.total,
        updated_at = NOW()
       FROM (
         SELECT NULLIF(COALESCE(SUM(quantity), 0), 0) AS total
         FROM export_bulking_cargo_lines
         WHERE shipment_id = $1
       ) sub
       WHERE s.id = $1`,
      [shipmentId],
    );
  }

  /* ───────── SAP lines (Data SAP per SO) ───────── */

  async listSapLines(shipmentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT id, shipment_id, so_no, line_order, quantity_spb, spb,
              delivery_order_pgi, spr, created_at, updated_at
       FROM export_bulking_sap_lines
       WHERE shipment_id = $1
       ORDER BY line_order ASC, so_no ASC, created_at ASC`,
      [shipmentId],
    );
    return result.rows;
  }

  async upsertSapLines(shipmentId: string, lines: SapLineDto[], spr?: string | null): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const normalized = lines.map((line, i) => ({
        ...line,
        so_no: line.so_no?.trim() ?? "",
        line_order: line.line_order ?? i + 1,
      }));

      for (const line of normalized) {
        if (!line.so_no) {
          throw new AppError("Each SAP row requires an SO number", 400);
        }
      }

      const soNos = normalized.map((line) => line.so_no);
      const uniqueSo = new Set(soNos);
      if (uniqueSo.size !== soNos.length) {
        throw new AppError("Duplicate SO numbers in SAP rows", 400);
      }

      if (soNos.length === 0) {
        await client.query(`DELETE FROM export_bulking_sap_lines WHERE shipment_id = $1`, [shipmentId]);
      } else {
        await client.query(
          `DELETE FROM export_bulking_sap_lines
           WHERE shipment_id = $1 AND NOT (so_no = ANY($2::text[]))`,
          [shipmentId, soNos],
        );
      }

      const results: unknown[] = [];
      for (const line of normalized) {
        if (line.id) {
          const res = await client.query(
            `UPDATE export_bulking_sap_lines SET
              so_no = $1,
              line_order = $2,
              quantity_spb = $3,
              spb = $4,
              delivery_order_pgi = $5,
              spr = NULL,
              updated_at = NOW()
             WHERE id = $6 AND shipment_id = $7
             RETURNING *`,
            [
              line.so_no,
              line.line_order,
              line.quantity_spb ?? null,
              line.spb?.trim() || null,
              line.delivery_order_pgi?.trim() || null,
              line.id,
              shipmentId,
            ],
          );
          if (res.rows[0]) {
            results.push(res.rows[0]);
          } else {
            throw new AppError(`SAP line ${line.id} not found for this shipment`, 400);
          }
        } else {
          const res = await client.query(
            `INSERT INTO export_bulking_sap_lines
              (shipment_id, so_no, line_order, quantity_spb, spb, delivery_order_pgi, spr, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NULL, NOW(), NOW())
             ON CONFLICT (shipment_id, so_no) DO UPDATE SET
              line_order = EXCLUDED.line_order,
              quantity_spb = EXCLUDED.quantity_spb,
              spb = EXCLUDED.spb,
              delivery_order_pgi = EXCLUDED.delivery_order_pgi,
              spr = NULL,
              updated_at = NOW()
             RETURNING *`,
            [
              shipmentId,
              line.so_no,
              line.line_order,
              line.quantity_spb ?? null,
              line.spb?.trim() || null,
              line.delivery_order_pgi?.trim() || null,
            ],
          );
          if (res.rows[0]) results.push(res.rows[0]);
        }
      }

      if (spr !== undefined) {
        await client.query(
          `UPDATE export_bulking_shipments SET spr = $1, updated_at = NOW() WHERE id = $2`,
          [spr?.trim() || null, shipmentId],
        );
      }

      await client.query("COMMIT");
      return results.sort((a, b) => {
        const ao = Number((a as { line_order?: number }).line_order ?? 0);
        const bo = Number((b as { line_order?: number }).line_order ?? 0);
        return ao - bo;
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /* ───────── Billing lines (Billing & Levy per SO) ───────── */

  async listBillingLines(shipmentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT id, shipment_id, so_no, line_order,
              biaya_keluar_price_usd_mt, biaya_keluar_amount_idr, biaya_keluar_billing_no,
              levy_price_usd_mt, levy_amount_idr, levy_billing_no,
              created_at, updated_at
       FROM export_bulking_billing_lines
       WHERE shipment_id = $1
       ORDER BY line_order ASC, so_no ASC, created_at ASC`,
      [shipmentId],
    );
    return result.rows;
  }

  async upsertBillingLines(shipmentId: string, lines: BillingLineDto[]): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const normalized = lines.map((line, i) => ({
        ...line,
        so_no: line.so_no?.trim() ?? "",
        line_order: line.line_order ?? i + 1,
      }));

      for (const line of normalized) {
        if (!line.so_no) {
          throw new AppError("Each billing row requires an SO number", 400);
        }
      }

      const soNos = normalized.map((line) => line.so_no);
      const uniqueSo = new Set(soNos);
      if (uniqueSo.size !== soNos.length) {
        throw new AppError("Duplicate SO numbers in billing rows", 400);
      }

      if (soNos.length === 0) {
        await client.query(`DELETE FROM export_bulking_billing_lines WHERE shipment_id = $1`, [shipmentId]);
      } else {
        await client.query(
          `DELETE FROM export_bulking_billing_lines
           WHERE shipment_id = $1 AND NOT (so_no = ANY($2::text[]))`,
          [shipmentId, soNos],
        );
      }

      const results: unknown[] = [];
      for (const line of normalized) {
        const params = [
          line.so_no,
          line.line_order,
          line.biaya_keluar_price_usd_mt ?? null,
          line.biaya_keluar_amount_idr ?? null,
          line.biaya_keluar_billing_no?.trim() || null,
          line.levy_price_usd_mt ?? null,
          line.levy_amount_idr ?? null,
          line.levy_billing_no?.trim() || null,
        ];
        if (line.id) {
          const res = await client.query(
            `UPDATE export_bulking_billing_lines SET
              so_no = $1,
              line_order = $2,
              biaya_keluar_price_usd_mt = $3,
              biaya_keluar_amount_idr = $4,
              biaya_keluar_billing_no = $5,
              levy_price_usd_mt = $6,
              levy_amount_idr = $7,
              levy_billing_no = $8,
              updated_at = NOW()
             WHERE id = $9 AND shipment_id = $10
             RETURNING *`,
            [...params, line.id, shipmentId],
          );
          if (res.rows[0]) {
            results.push(res.rows[0]);
          } else {
            throw new AppError(`Billing line ${line.id} not found for this shipment`, 400);
          }
        } else {
          const res = await client.query(
            `INSERT INTO export_bulking_billing_lines
              (shipment_id, so_no, line_order,
               biaya_keluar_price_usd_mt, biaya_keluar_amount_idr, biaya_keluar_billing_no,
               levy_price_usd_mt, levy_amount_idr, levy_billing_no,
               created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
             ON CONFLICT (shipment_id, so_no) DO UPDATE SET
              line_order = EXCLUDED.line_order,
              biaya_keluar_price_usd_mt = EXCLUDED.biaya_keluar_price_usd_mt,
              biaya_keluar_amount_idr = EXCLUDED.biaya_keluar_amount_idr,
              biaya_keluar_billing_no = EXCLUDED.biaya_keluar_billing_no,
              levy_price_usd_mt = EXCLUDED.levy_price_usd_mt,
              levy_amount_idr = EXCLUDED.levy_amount_idr,
              levy_billing_no = EXCLUDED.levy_billing_no,
              updated_at = NOW()
             RETURNING *`,
            [shipmentId, ...params],
          );
          if (res.rows[0]) results.push(res.rows[0]);
        }
      }

      await client.query("COMMIT");
      return results.sort((a, b) => {
        const ao = Number((a as { line_order?: number }).line_order ?? 0);
        const bo = Number((b as { line_order?: number }).line_order ?? 0);
        return ao - bo;
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  /* ───────── Bills of lading (multiple per shipment) ───────── */

  async listBillsOfLading(shipmentId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT id, shipment_id, line_order, bill_of_lading_no, bill_of_lading_date, bill_of_lading_nn_obl,
              created_at, updated_at
       FROM export_bulking_bills_of_lading
       WHERE shipment_id = $1
       ORDER BY line_order ASC, created_at ASC`,
      [shipmentId],
    );
    return result.rows;
  }

  private async syncShipmentBillOfLadingSnapshot(client: PoolClient, shipmentId: string): Promise<void> {
    await client.query(
      `UPDATE export_bulking_shipments s SET
        bill_of_lading_no = bol.bill_of_lading_no,
        bill_of_lading_date = bol.bill_of_lading_date,
        bill_of_lading_nn_obl = bol.bill_of_lading_nn_obl,
        updated_at = NOW()
       FROM (
         SELECT bill_of_lading_no, bill_of_lading_date, bill_of_lading_nn_obl
         FROM export_bulking_bills_of_lading
         WHERE shipment_id = $1
         ORDER BY line_order ASC, created_at ASC
         LIMIT 1
       ) bol
       WHERE s.id = $1`,
      [shipmentId],
    );
    await client.query(
      `UPDATE export_bulking_shipments SET
        bill_of_lading_no = NULL,
        bill_of_lading_date = NULL,
        bill_of_lading_nn_obl = NULL,
        updated_at = NOW()
       WHERE id = $1
         AND NOT EXISTS (SELECT 1 FROM export_bulking_bills_of_lading WHERE shipment_id = $1)`,
      [shipmentId],
    );
  }

  async upsertBillsOfLading(shipmentId: string, lines: BillOfLadingDto[]): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const normalized = lines.map((line, i) => ({
        ...line,
        line_order: line.line_order ?? i + 1,
        bill_of_lading_no: line.bill_of_lading_no?.trim() || null,
        bill_of_lading_nn_obl: line.bill_of_lading_nn_obl?.trim() || null,
      }));

      const keepIds = normalized.map((l) => l.id).filter(Boolean) as string[];
      if (keepIds.length === 0) {
        await client.query(`DELETE FROM export_bulking_bills_of_lading WHERE shipment_id = $1`, [shipmentId]);
      } else {
        await client.query(
          `DELETE FROM export_bulking_bills_of_lading
           WHERE shipment_id = $1 AND NOT (id = ANY($2::uuid[]))`,
          [shipmentId, keepIds],
        );
      }

      const results: unknown[] = [];
      for (const line of normalized) {
        const params = [
          line.line_order,
          line.bill_of_lading_no,
          line.bill_of_lading_date ?? null,
          line.bill_of_lading_nn_obl,
        ];
        if (line.id) {
          const res = await client.query(
            `UPDATE export_bulking_bills_of_lading SET
              line_order = $1,
              bill_of_lading_no = $2,
              bill_of_lading_date = $3,
              bill_of_lading_nn_obl = $4,
              updated_at = NOW()
             WHERE id = $5 AND shipment_id = $6
             RETURNING *`,
            [...params, line.id, shipmentId],
          );
          if (res.rows[0]) {
            results.push(res.rows[0]);
          } else {
            throw new AppError(`Bill of lading ${line.id} not found for this shipment`, 400);
          }
        } else if (line.bill_of_lading_no || line.bill_of_lading_date || line.bill_of_lading_nn_obl) {
          const res = await client.query(
            `INSERT INTO export_bulking_bills_of_lading
              (shipment_id, line_order, bill_of_lading_no, bill_of_lading_date, bill_of_lading_nn_obl, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
             RETURNING *`,
            [shipmentId, ...params],
          );
          if (res.rows[0]) results.push(res.rows[0]);
        }
      }

      await this.syncShipmentBillOfLadingSnapshot(client, shipmentId);
      await client.query("COMMIT");
      return results.sort((a, b) => {
        const ao = Number((a as { line_order?: number }).line_order ?? 0);
        const bo = Number((b as { line_order?: number }).line_order ?? 0);
        return ao - bo;
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async upsertSiPebFields(shipmentId: string, items: SiPebFieldsDto[]): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results: unknown[] = [];
      for (const item of items) {
        const id = item.id?.trim();
        if (!id) continue;
        const res = await client.query(
          `UPDATE export_bulking_shipping_instructions SET
            peb_request_no = $1,
            peb_no = $2,
            peb_date = $3,
            hs_code = $4,
            updated_at = NOW()
           WHERE id = $5 AND shipment_id = $6
           RETURNING *`,
          [
            item.peb_request_no?.trim() || null,
            item.peb_no?.trim() || null,
            item.peb_date ?? null,
            item.hs_code?.trim() || null,
            id,
            shipmentId,
          ],
        );
        if (res.rows[0]) {
          const si = res.rows[0] as { id: string; lines?: unknown[] };
          const lineResult = await client.query(
            `SELECT * FROM export_bulking_si_lines WHERE si_id = $1 ORDER BY created_at ASC`,
            [si.id],
          );
          si.lines = lineResult.rows;
          results.push(si);
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
        const serial = await this.allocateNextSerial(client, SERIES_SI_EUP, year);
        siNumber = formatSiDocumentNumber(year, month, serial);
      } else {
        await assertUniqueExportDocumentNumber(client, SI_NUMBER_SPEC, siNumber);
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
              (si_id, cargo_line_id, description_of_goods, quantity, bl_split_qty, bl_splits, bl_split_text, destination_port, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
             RETURNING *`,
            [si.id, line.cargo_line_id ?? null, line.description_of_goods ?? null,
             line.quantity ?? null, line.bl_split_qty ?? null,
             line.bl_splits?.length ? JSON.stringify(line.bl_splits) : null,
             line.bl_split_text ?? null,
             line.destination_port ?? null],
          );
          if (lineRes.rows[0]) si.lines.push(lineRes.rows[0]);
        }
      }

      await client.query("COMMIT");
      return si;
    } catch (e) {
      await client.query("ROLLBACK");
      rethrowDocumentNumberConflict(e, "SI number");
    } finally {
      client.release();
    }
  }

  async updateShippingInstruction(
    shipmentId: string,
    id: string,
    dto: ShippingInstructionDto,
    actingUserId?: string | null,
  ): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const prevRes = await client.query(
        `SELECT si_number, doc_number_held_by_user_id, shipment_id FROM export_bulking_shipping_instructions WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const prev = prevRes.rows[0] as
        | { si_number: string | null; doc_number_held_by_user_id: string | null; shipment_id: string }
        | undefined;
      if (!prev || prev.shipment_id !== shipmentId) {
        await client.query("ROLLBACK");
        return null;
      }

      let nextHolder = prev.doc_number_held_by_user_id;
      if (actingUserId && dto.si_number !== undefined) {
        const a = (prev.si_number ?? "").trim();
        const b = (dto.si_number ?? "").trim();
        if (a !== b) nextHolder = actingUserId;
      }

      if (dto.si_number !== undefined) {
        await assertUniqueExportDocumentNumber(client, SI_NUMBER_SPEC, dto.si_number, id);
      }

      const siRes = await client.query(
        `UPDATE export_bulking_shipping_instructions SET
          si_number=$1, messrs=$2, bill_of_lading_option=$3, consignee=$4, notify_party=$5,
          freight=$6, shipper_snapshot=$7, npwp=$8, bl_indicated=$9,
          doc_number_held_by_user_id=$10,
          updated_at=NOW()
         WHERE id=$11 RETURNING *`,
        [
          dto.si_number !== undefined ? trimDocNumber(dto.si_number) : prev.si_number,
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
                (si_id, cargo_line_id, description_of_goods, quantity, bl_split_qty, bl_splits, bl_split_text, destination_port, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
               RETURNING *`,
              [id, line.cargo_line_id ?? null, line.description_of_goods ?? null,
               line.quantity ?? null, line.bl_split_qty ?? null,
               line.bl_splits?.length ? JSON.stringify(line.bl_splits) : null,
               line.bl_split_text ?? null,
               line.destination_port ?? null],
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
      rethrowDocumentNumberConflict(e, "SI number");
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
        const serial = await this.allocateNextSerial(client, SERIES_SI_EUP, year);
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
        const serial = await this.allocateNextSerial(client, SERIES_CI_EU, year);
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
        const serial = await this.allocateNextSerial(client, SERIES_PL_EUP, year);
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

  async deleteShippingInstruction(shipmentId: string, id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query<{ si_number: string | null }>(
        `SELECT si_number FROM export_bulking_shipping_instructions WHERE id = $1 AND shipment_id = $2`,
        [id, shipmentId],
      );
      if (cur.rows.length === 0) {
        throw new AppError("Shipping instruction not found", 404);
      }
      const siNumber = cur.rows[0].si_number;
      await client.query(
        `DELETE FROM export_bulking_shipping_instructions WHERE id = $1 AND shipment_id = $2`,
        [id, shipmentId],
      );
      await this.releaseSerialIfLast(client, SERIES_SI_EUP, siNumber);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async getShippingInstructionShipmentId(siId: string): Promise<string | null> {
    const r = await this.pool.query(
      `SELECT shipment_id FROM export_bulking_shipping_instructions WHERE id = $1`,
      [siId],
    );
    const row = r.rows[0] as { shipment_id?: string } | undefined;
    return row?.shipment_id ?? null;
  }

  async getPackingListShipmentId(plId: string): Promise<string | null> {
    const r = await this.pool.query(
      `SELECT shipment_id FROM export_bulking_packing_lists WHERE id = $1`,
      [plId],
    );
    const row = r.rows[0] as { shipment_id?: string } | undefined;
    return row?.shipment_id ?? null;
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
        const serial = await this.allocateNextSerial(client, SERIES_CI_EU, year);
        invoiceNo = formatInvoiceDocumentNumber(year, month, serial);
      } else {
        await assertUniqueExportDocumentNumber(client, INVOICE_NUMBER_SPEC, invoiceNo);
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
      rethrowDocumentNumberConflict(e, "Invoice number");
    } finally {
      client.release();
    }
  }

  async updateInvoice(
    shipmentId: string,
    id: string,
    dto: InvoiceDto,
    actingUserId?: string | null,
  ): Promise<unknown> {
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

      if (!current || current.shipment_id !== shipmentId) {
        await client.query("ROLLBACK");
        return null;
      }

      const currentStatus = String((current as { status?: string }).status ?? "DRAFT");
      if (currentStatus === "FINAL") {
        await client.query("ROLLBACK");
        throw new AppError("Finalized invoices cannot be edited. Use Amend to reopen.", 409);
      }

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

      if (dto.invoice_no !== undefined) {
        await assertUniqueExportDocumentNumber(client, INVOICE_NUMBER_SPEC, dto.invoice_no, id);
      }

      const invRes = await client.query(
        `UPDATE export_bulking_invoices SET
          invoice_no=$1, invoice_date=$2, messrs=$3, vessel_voyage_snapshot=$4,
          loadport_snapshot=$5, destination_snapshot=$6, marks=$7,
          shipping_instruction_id=$8, doc_number_held_by_user_id=$9, updated_at=NOW()
         WHERE id=$10 RETURNING *`,
        [dto.invoice_no !== undefined ? trimDocNumber(dto.invoice_no) : invoice_no, invoice_date, messrs, vessel_voyage_snapshot,
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
      rethrowDocumentNumberConflict(e, "Invoice number");
    } finally {
      client.release();
    }
  }

  async deleteInvoice(shipmentId: string, id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query<{ invoice_no: string | null; status: string | null }>(
        `SELECT invoice_no, status FROM export_bulking_invoices WHERE id = $1 AND shipment_id = $2`,
        [id, shipmentId],
      );
      if (cur.rows.length === 0) {
        throw new AppError("Invoice not found", 404);
      }
      const row = cur.rows[0];
      if (row.status === "FINAL") {
        throw new AppError("Finalized invoices cannot be deleted. Use Amend first.", 409);
      }
      await client.query(
        `DELETE FROM export_bulking_invoices WHERE id = $1 AND shipment_id = $2`,
        [id, shipmentId],
      );
      await this.releaseSerialIfLast(client, SERIES_CI_EU, row.invoice_no);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

  async getInvoiceHeader(id: string): Promise<{ shipment_id: string; shipping_instruction_id: string | null; status?: string } | null> {
    const r = await this.pool.query(
      `SELECT shipment_id, shipping_instruction_id, status FROM export_bulking_invoices WHERE id = $1`,
      [id],
    );
    const row = r.rows[0] as { shipment_id?: string; shipping_instruction_id?: string | null; status?: string } | undefined;
    if (!row?.shipment_id) return null;
    return {
      shipment_id: row.shipment_id,
      shipping_instruction_id: row.shipping_instruction_id ?? null,
      status: row.status,
    };
  }

  async getInvoiceById(id: string): Promise<Record<string, unknown> | null> {
    const invResult = await this.pool.query(`SELECT * FROM export_bulking_invoices WHERE id = $1`, [id]);
    const inv = invResult.rows[0] as Record<string, unknown> | undefined;
    if (!inv) return null;
    const lineResult = await this.pool.query(
      `SELECT * FROM export_bulking_invoice_lines WHERE invoice_id = $1 ORDER BY item_no ASC, created_at ASC`,
      [id],
    );
    inv.lines = lineResult.rows;
    return inv;
  }

  async insertInvoiceEvent(input: {
    invoiceId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    changes: unknown;
    reason?: string | null;
    changedBy?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO export_bulking_invoice_events
        (invoice_id, event_type, from_status, to_status, changes, reason, changed_by, changed_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,NOW())`,
      [
        input.invoiceId,
        input.eventType,
        input.fromStatus ?? null,
        input.toStatus ?? null,
        JSON.stringify(input.changes ?? []),
        input.reason ?? null,
        input.changedBy ?? null,
      ],
    );
  }

  async listInvoiceEvents(invoiceId: string): Promise<unknown[]> {
    const r = await this.pool.query(
      `SELECT id, invoice_id, event_type, from_status, to_status, changes, reason, changed_by, changed_at
       FROM export_bulking_invoice_events
       WHERE invoice_id = $1
       ORDER BY changed_at ASC`,
      [invoiceId],
    );
    return r.rows;
  }

  async persistInvoiceDraftSnapshot(invoiceId: string, snapshot: unknown): Promise<void> {
    await this.pool.query(
      `UPDATE export_bulking_invoices
       SET draft_snapshot = $1::jsonb, last_draft_saved_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(snapshot), invoiceId],
    );
  }

  async splitInvoicesForSi(
    shipmentId: string,
    siId: string,
    quantities: number[],
    cargoLineId: string | null,
    userId?: string | null,
  ): Promise<unknown[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await assertShippingInstructionMatchesShipment(client, shipmentId, siId);

      const created: unknown[] = [];
      const { year, month } = utcYearMonthNow();
      const holder = userId ?? null;

      for (let i = 0; i < quantities.length; i++) {
        const qty = quantities[i];
        const serial = await this.allocateNextSerial(client, SERIES_CI_EU, year);
        const invoiceNo = formatInvoiceDocumentNumber(year, month, serial);

        const invRes = await client.query(
          `INSERT INTO export_bulking_invoices
            (shipment_id, shipping_instruction_id, invoice_no, status, doc_number_held_by_user_id, created_at, updated_at)
           VALUES ($1,$2,$3,'DRAFT',$4,NOW(),NOW())
           RETURNING *`,
          [shipmentId, siId, invoiceNo, holder],
        );
        const inv = invRes.rows[0] as { id: string; lines?: unknown[] };
        inv.lines = [];

        if (qty > 0) {
          const lineRes = await client.query(
            `INSERT INTO export_bulking_invoice_lines
              (invoice_id, cargo_line_id, item_no, quantity, created_at, updated_at)
             VALUES ($1,$2,$3,$4,NOW(),NOW())
             RETURNING *`,
            [inv.id, cargoLineId, 1, qty],
          );
          if (lineRes.rows[0]) inv.lines.push(lineRes.rows[0]);
        }

        const snapshot = {
          invoice_no: invRes.rows[0].invoice_no,
          shipping_instruction_id: siId,
          lines: inv.lines,
        };
        await client.query(
          `UPDATE export_bulking_invoices SET draft_snapshot = $1::jsonb, last_draft_saved_at = NOW() WHERE id = $2`,
          [JSON.stringify(snapshot), inv.id],
        );

        created.push(inv);
      }

      await client.query("COMMIT");
      return created;
    } catch (e) {
      await client.query("ROLLBACK");
      rethrowDocumentNumberConflict(e, "Invoice number");
      throw e;
    } finally {
      client.release();
    }
  }

  async finalizeInvoiceRecord(
    invoiceId: string,
    input: {
      draftSnapshot: unknown;
      finalSnapshot: unknown;
      userId: string;
    },
  ): Promise<Record<string, unknown> | null> {
    const r = await this.pool.query(
      `UPDATE export_bulking_invoices SET
        status = 'FINAL',
        draft_snapshot = $1::jsonb,
        final_snapshot = $2::jsonb,
        finalized_at = NOW(),
        finalized_by = $3,
        last_draft_saved_at = NOW(),
        updated_at = NOW()
       WHERE id = $4 AND status = 'DRAFT'
       RETURNING *`,
      [JSON.stringify(input.draftSnapshot), JSON.stringify(input.finalSnapshot), input.userId, invoiceId],
    );
    return (r.rows[0] as Record<string, unknown>) ?? null;
  }

  async amendInvoiceRecord(
    invoiceId: string,
    userId: string,
    reason: string,
  ): Promise<Record<string, unknown> | null> {
    const r = await this.pool.query(
      `UPDATE export_bulking_invoices SET
        status = 'DRAFT',
        revision_no = revision_no + 1,
        finalized_at = NULL,
        finalized_by = NULL,
        final_snapshot = NULL,
        updated_at = NOW()
       WHERE id = $1 AND status = 'FINAL'
       RETURNING *`,
      [invoiceId],
    );
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    await this.insertInvoiceEvent({
      invoiceId,
      eventType: "AMENDED",
      fromStatus: "FINAL",
      toStatus: "DRAFT",
      changes: [],
      reason,
      changedBy: userId,
    });
    return row;
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
        const serial = await this.allocateNextSerial(client, SERIES_PL_EUP, year);
        plNumber = formatPlDocumentNumber(year, month, serial);
      } else {
        await assertUniqueExportDocumentNumber(client, PACKING_LIST_NUMBER_SPEC, plNumber);
      }

      const siId = dto.shipping_instruction_id ?? null;
      if (siId) {
        await assertShippingInstructionMatchesShipment(client, shipmentId, siId);
      }

      const plRes = await client.query(
        `INSERT INTO export_bulking_packing_lists
          (shipment_id, shipping_instruction_id, packing_list_number, loadport_snapshot, destination_snapshot, doc_number_held_by_user_id, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
         RETURNING *`,
        [shipmentId, siId, plNumber,
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
      rethrowDocumentNumberConflict(e, "Packing list number");
    } finally {
      client.release();
    }
  }

  async updatePackingList(
    shipmentId: string,
    id: string,
    dto: PackingListDto,
    actingUserId?: string | null,
  ): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const prevRes = await client.query(
        `SELECT shipment_id, shipping_instruction_id, packing_list_number, loadport_snapshot, destination_snapshot, doc_number_held_by_user_id
         FROM export_bulking_packing_lists WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const prev = prevRes.rows[0] as
        | {
            shipment_id: string;
            shipping_instruction_id: string | null;
            packing_list_number: string | null;
            loadport_snapshot: string | null;
            destination_snapshot: string | null;
            doc_number_held_by_user_id: string | null;
          }
        | undefined;
      if (!prev || prev.shipment_id !== shipmentId) {
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

      let nextSiId = prev.shipping_instruction_id;
      if (dto.shipping_instruction_id !== undefined) {
        nextSiId = dto.shipping_instruction_id === null ? null : dto.shipping_instruction_id;
      }
      if (nextSiId) {
        await assertShippingInstructionMatchesShipment(client, prev.shipment_id, nextSiId);
      }

      if (dto.packing_list_number !== undefined) {
        await assertUniqueExportDocumentNumber(client, PACKING_LIST_NUMBER_SPEC, dto.packing_list_number, id);
      }

      const plRes = await client.query(
        `UPDATE export_bulking_packing_lists SET
          packing_list_number=$1, loadport_snapshot=$2, destination_snapshot=$3,
          shipping_instruction_id=$4, doc_number_held_by_user_id=$5, updated_at=NOW()
         WHERE id=$6 RETURNING *`,
        [
          dto.packing_list_number !== undefined ? trimDocNumber(dto.packing_list_number) : prev.packing_list_number,
          loadport,
          dest,
          nextSiId,
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
      rethrowDocumentNumberConflict(e, "Packing list number");
    } finally {
      client.release();
    }
  }

  async deletePackingList(shipmentId: string, id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const cur = await client.query<{ packing_list_number: string | null }>(
        `SELECT packing_list_number FROM export_bulking_packing_lists WHERE id = $1 AND shipment_id = $2`,
        [id, shipmentId],
      );
      if (cur.rows.length === 0) {
        throw new AppError("Packing list not found", 404);
      }
      const plNumber = cur.rows[0].packing_list_number;
      await client.query(
        `DELETE FROM export_bulking_packing_lists WHERE id = $1 AND shipment_id = $2`,
        [id, shipmentId],
      );
      await this.releaseSerialIfLast(client, SERIES_PL_EUP, plNumber);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
