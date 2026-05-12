/**
 * Shipment repository: database access only.
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import { classificationFilterSqlVariants } from "../../../shared/product-classification.js";
import type {
  CreateShipmentDto,
  UpdateShipmentDto,
  ListShipmentsQuery,
  ShipmentImportHistoryRow,
  ShipmentListFilterOptions,
  ShipmentRow,
} from "../dto/index.js";
import { DEFAULT_FREIGHT_CHARGE_CURRENCY } from "../../../shared/freight-currency.js";

export class ShipmentRepository {
  private get pool(): Pool {
    return getPool();
  }

  async getNextShipmentNo(year: number): Promise<string> {
    const prefix = `SHP-${year}-`;
    const result = await this.pool.query<{ shipment_no: string }>(
      `SELECT shipment_no FROM shipments WHERE shipment_no LIKE $1 ORDER BY shipment_no DESC LIMIT 1`,
      [prefix + "%"]
    );
    const last = result.rows[0]?.shipment_no;
    const nextNum = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(nextNum).padStart(4, "0")}`;
  }

  private readonly selectColumns = `id, shipment_no, vendor_code, vendor_name, forwarder_code, forwarder_name, warehouse_code, warehouse_name,
    incoterm, shipment_method, origin_port_code, origin_port_name, origin_port_country,
    destination_port_code, destination_port_name, destination_port_country, etd, eta, atd, ata, depo, depo_location, current_status,
    closed_at, close_reason, remarks, created_at, updated_at,
    pib_type, no_request_pib, ppjk_mkl, nopen, nopen_date, ship_by, bl_awb, insurance_no, coo, incoterm_amount, incoterm_currency, cbm, net_weight_mt, gross_weight_mt, bm, ppn_amount, pph_amount, kawasan_berikat, surveyor,
    product_classification,
    unit_20ft, unit_40ft, unit_package, unit_20_iso_tank, container_count_20ft, container_count_40ft, package_count, container_count_20_iso_tank,
    deleted_at, deleted_by`;

  async create(dto: CreateShipmentDto, shipmentNo: string): Promise<ShipmentRow> {
    const etd = dto.etd ? new Date(dto.etd) : null;
    const eta = dto.eta ? new Date(dto.eta) : null;
    const nopenDate = dto.nopen_date ? new Date(dto.nopen_date) : null;
    const result = await this.pool.query<ShipmentRow>(
      `INSERT INTO shipments (
        shipment_no, vendor_code, vendor_name, forwarder_code, forwarder_name, warehouse_code, warehouse_name,
        incoterm, shipment_method, origin_port_code, origin_port_name, origin_port_country,
        destination_port_code, destination_port_name, destination_port_country, etd, eta, remarks,
        pib_type, no_request_pib, ppjk_mkl, nopen, nopen_date, ship_by, bl_awb, insurance_no, coo, incoterm_amount, incoterm_currency, cbm, bm, kawasan_berikat,
        product_classification,
        current_status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, 'INITIATE_SHIPPING_DOCUMENT', NOW(), NOW())
      RETURNING ${this.selectColumns}`,
      [
        shipmentNo,
        dto.vendor_code ?? null,
        dto.vendor_name ?? null,
        dto.forwarder_code ?? null,
        dto.forwarder_name ?? null,
        dto.warehouse_code ?? null,
        dto.warehouse_name ?? null,
        dto.incoterm ?? null,
        dto.shipment_method ?? null,
        dto.origin_port_code ?? null,
        dto.origin_port_name ?? null,
        dto.origin_port_country ?? null,
        dto.destination_port_code ?? null,
        dto.destination_port_name ?? null,
        dto.destination_port_country ?? null,
        etd,
        eta,
        dto.remarks ?? null,
        dto.pib_type ?? null,
        dto.no_request_pib ?? null,
        dto.ppjk_mkl ?? null,
        dto.nopen ?? null,
        nopenDate,
        dto.ship_by ?? null,
        dto.bl_awb ?? null,
        dto.insurance_no ?? null,
        dto.coo ?? null,
        dto.incoterm_amount ?? null,
        dto.incoterm_currency ?? DEFAULT_FREIGHT_CHARGE_CURRENCY,
        dto.cbm ?? null,
        null,
        dto.kawasan_berikat ?? null,
        dto.product_classification ?? null,
      ]
    );
    if (!result.rows[0]) throw new Error("ShipmentRepository.create: no row returned");
    return result.rows[0];
  }

  async findById(id: string): Promise<ShipmentRow | null> {
    const result = await this.pool.query<ShipmentRow>(
      `SELECT ${this.selectColumns} FROM shipments WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async findByShipmentNo(shipmentNo: string): Promise<ShipmentRow | null> {
    const result = await this.pool.query<ShipmentRow>(
      `SELECT ${this.selectColumns} FROM shipments WHERE LOWER(TRIM(shipment_no)) = LOWER(TRIM($1)) AND deleted_at IS NULL LIMIT 1`,
      [shipmentNo]
    );
    return result.rows[0] ?? null;
  }

  private firstCoupledPoScalar(selectExpr: string): string {
    return `(SELECT ${selectExpr}
      FROM shipment_po_mapping m0
      JOIN Import_purchase_order i0 ON i0.id = m0.intake_id
      WHERE m0.shipment_id = s.id AND m0.decoupled_at IS NULL
      ORDER BY m0.coupled_at ASC NULLS LAST
      LIMIT 1)`;
  }

  private buildShipmentListOrderBy(query: ListShipmentsQuery): string {
    const dir = query.sort_dir === "desc" ? "DESC" : "ASC";
    const key = query.sort_by?.trim() ?? "";
    const picFirst = `(SELECT u2.name
      FROM shipment_po_mapping m2
      JOIN Import_purchase_order i2 ON i2.id = m2.intake_id
      LEFT JOIN users u2 ON u2.id::text = i2.taken_by_user_id
      WHERE m2.shipment_id = s.id AND m2.decoupled_at IS NULL
        AND TRIM(COALESCE(u2.name, '')) <> ''
      ORDER BY m2.coupled_at ASC NULLS LAST
      LIMIT 1)`;
    const cols: Record<string, string> = {
      pt: this.firstCoupledPoScalar("i0.pt"),
      plant: this.firstCoupledPoScalar("i0.plant"),
      shipment: "s.shipment_no",
      status: "s.current_status",
      po_number: this.firstCoupledPoScalar("i0.po_number"),
      vendor: "s.vendor_name",
      incoterm: "s.incoterm",
      pib_type: "s.pib_type",
      shipment_method: "s.shipment_method",
      ship_via: "s.shipment_method",
      product_classification: "s.product_classification",
      ship_by: "s.ship_by",
      pic: picFirst,
      forwarder: "s.forwarder_name",
      etd: "s.etd",
      eta: "s.eta",
      origin_port: "s.origin_port_name",
      destination_port: "s.destination_port_name",
    };
    const expr = cols[key];
    if (!expr) {
      return "ORDER BY s.created_at DESC NULLS LAST, s.id DESC";
    }
    return `ORDER BY ${expr} ${dir} NULLS LAST, s.id ${dir}`;
  }

  async findAll(query: ListShipmentsQuery): Promise<{ rows: ShipmentRow[]; total: number }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 10));
    const offset = (page - 1) * limit;
    const conditions: string[] = ["s.deleted_at IS NULL"];
    const params: unknown[] = [];
    let idx = 1;

    const statusList = [
      ...new Set(
        [...(query.statuses ?? []), ...(query.status?.trim() ? [query.status.trim()] : [])].filter(Boolean)
      ),
    ];
    if (statusList.length === 1) {
      conditions.push(`s.current_status = $${idx++}`);
      params.push(statusList[0]);
    } else if (statusList.length > 1) {
      conditions.push(`s.current_status = ANY($${idx++}::text[])`);
      params.push(statusList);
    }
    if (query.supplier_name) {
      conditions.push(`s.vendor_name ILIKE $${idx++}`);
      params.push(`%${query.supplier_name}%`);
    }
    if (query.from_date) {
      conditions.push(`s.created_at >= $${idx++}`);
      params.push(query.from_date);
    }
    if (query.to_date) {
      conditions.push(`s.created_at <= $${idx++}`);
      params.push(query.to_date);
    }
    if (query.created_from) {
      conditions.push(`(s.created_at AT TIME ZONE 'UTC')::date >= $${idx++}::date`);
      params.push(query.created_from);
    }
    if (query.created_to) {
      conditions.push(`(s.created_at AT TIME ZONE 'UTC')::date <= $${idx++}::date`);
      params.push(query.created_to);
    }
    if (query.search) {
      const term = `%${query.search}%`;
      conditions.push(
        `(
          s.shipment_no ILIKE $${idx}
          OR s.vendor_name ILIKE $${idx}
          OR EXISTS (
            SELECT 1 FROM shipment_po_mapping m
            JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
            WHERE m.shipment_id = s.id AND i.po_number ILIKE $${idx}
          )
        )`
      );
      params.push(term);
      idx++;
    }
    if (query.po_number) {
      conditions.push(`EXISTS (
        SELECT 1 FROM shipment_po_mapping m
        JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
        WHERE m.shipment_id = s.id AND i.po_number ILIKE $${idx}
      )`);
      params.push(`%${query.po_number}%`);
      idx++;
    }
    if (query.active_pipeline) {
      conditions.push(`s.closed_at IS NULL`);
      conditions.push(`s.current_status <> 'DELIVERED'`);
    }
    if (query.po_from_date || query.po_to_date) {
      const poDateParts = [
        `EXISTS (
          SELECT 1 FROM shipment_po_mapping m
          JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
          WHERE m.shipment_id = s.id`,
      ];
      if (query.po_from_date) {
        poDateParts.push(
          `AND COALESCE(i.po_date, (i.created_at AT TIME ZONE 'UTC')::date) >= $${idx}::date`
        );
        params.push(query.po_from_date);
        idx++;
      }
      if (query.po_to_date) {
        poDateParts.push(
          `AND COALESCE(i.po_date, (i.created_at AT TIME ZONE 'UTC')::date) <= $${idx}::date`
        );
        params.push(query.po_to_date);
        idx++;
      }
      poDateParts.push(`)`);
      conditions.push(poDateParts.join(" "));
    }
    const ptList = [
      ...new Set(
        [...(query.pts ?? []), ...(query.pt?.trim() ? [query.pt.trim()] : [])].filter(Boolean)
      ),
    ];
    if (ptList.length === 1) {
      conditions.push(`EXISTS (
        SELECT 1 FROM shipment_po_mapping m
        JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
        WHERE m.shipment_id = s.id AND TRIM(COALESCE(i.pt, '')) = $${idx++}
      )`);
      params.push(ptList[0]);
    } else if (ptList.length > 1) {
      conditions.push(`EXISTS (
        SELECT 1 FROM shipment_po_mapping m
        JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
        WHERE m.shipment_id = s.id AND TRIM(COALESCE(i.pt, '')) = ANY($${idx++}::text[])
      )`);
      params.push(ptList);
    }

    const plantList = [
      ...new Set(
        [...(query.plants ?? []), ...(query.plant?.trim() ? [query.plant.trim()] : [])].filter(Boolean)
      ),
    ];
    if (plantList.length === 1) {
      conditions.push(`EXISTS (
        SELECT 1 FROM shipment_po_mapping m
        JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
        WHERE m.shipment_id = s.id AND TRIM(COALESCE(i.plant, '')) = $${idx++}
      )`);
      params.push(plantList[0]);
    } else if (plantList.length > 1) {
      conditions.push(`EXISTS (
        SELECT 1 FROM shipment_po_mapping m
        JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
        WHERE m.shipment_id = s.id AND TRIM(COALESCE(i.plant, '')) = ANY($${idx++}::text[])
      )`);
      params.push(plantList);
    }

    const classCanon = [
      ...new Set(
        [
          ...(query.product_classifications ?? []),
          ...(query.product_classification?.trim() ? [query.product_classification.trim()] : []),
        ].filter(Boolean)
      ),
    ];
    if (classCanon.length > 0) {
      const variantSet = new Set<string>();
      for (const c of classCanon) {
        for (const v of classificationFilterSqlVariants(c)) {
          variantSet.add(v);
        }
      }
      const variants = [...variantSet];
      if (variants.length === 1) {
        conditions.push(`TRIM(COALESCE(s.product_classification, '')) = $${idx++}`);
        params.push(variants[0]);
      } else {
        conditions.push(`TRIM(COALESCE(s.product_classification, '')) = ANY($${idx++}::text[])`);
        params.push(variants);
      }
    }

    const vendorList = [
      ...new Set(
        [
          ...(query.vendor_names_exact ?? []),
          ...(query.vendor_name_exact?.trim() ? [query.vendor_name_exact.trim()] : []),
        ].filter(Boolean)
      ),
    ];
    if (vendorList.length === 1) {
      conditions.push(`LOWER(TRIM(COALESCE(s.vendor_name, ''))) = LOWER($${idx++})`);
      params.push(vendorList[0]);
    } else if (vendorList.length > 1) {
      conditions.push(`LOWER(TRIM(COALESCE(s.vendor_name, ''))) = ANY($${idx++}::text[])`);
      params.push(vendorList.map((v) => v.toLowerCase()));
    }

    const shipmentNoList = [...new Set([...(query.shipment_nos ?? [])].filter(Boolean))];
    if (shipmentNoList.length === 1) {
      conditions.push(`s.shipment_no = $${idx++}`);
      params.push(shipmentNoList[0]);
    } else if (shipmentNoList.length > 1) {
      conditions.push(`s.shipment_no = ANY($${idx++}::text[])`);
      params.push(shipmentNoList);
    }

    const poNumList = [...new Set([...(query.po_numbers ?? [])].filter(Boolean))];
    if (poNumList.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM shipment_po_mapping m
        JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
        WHERE m.shipment_id = s.id AND i.po_number = ANY($${idx++}::text[])
      )`);
      params.push(poNumList);
    }

    const incotermList = [...new Set([...(query.incoterms ?? [])].filter(Boolean))];
    if (incotermList.length === 1) {
      conditions.push(`TRIM(COALESCE(s.incoterm, '')) = $${idx++}`);
      params.push(incotermList[0]);
    } else if (incotermList.length > 1) {
      conditions.push(`TRIM(COALESCE(s.incoterm, '')) = ANY($${idx++}::text[])`);
      params.push(incotermList);
    }

    const pibList = [...new Set([...(query.pib_types ?? [])].filter(Boolean))];
    if (pibList.length === 1) {
      conditions.push(`TRIM(COALESCE(s.pib_type, '')) = $${idx++}`);
      params.push(pibList[0]);
    } else if (pibList.length > 1) {
      conditions.push(`TRIM(COALESCE(s.pib_type, '')) = ANY($${idx++}::text[])`);
      params.push(pibList);
    }

    const methodList = [
      ...new Set(
        [...(query.shipment_methods ?? []), ...(query.shipment_method?.trim() ? [query.shipment_method.trim()] : [])].filter(
          Boolean
        )
      ),
    ];
    if (methodList.length === 1) {
      conditions.push(`UPPER(TRIM(COALESCE(s.shipment_method, ''))) = UPPER($${idx++})`);
      params.push(methodList[0]);
    } else if (methodList.length > 1) {
      conditions.push(
        `UPPER(TRIM(COALESCE(s.shipment_method, ''))) = ANY(SELECT UPPER(unnest($${idx++}::text[])))`
      );
      params.push(methodList);
    }

    const shipByList = [...new Set([...(query.ship_bys ?? [])].filter(Boolean))];
    if (shipByList.length === 1) {
      conditions.push(`TRIM(COALESCE(s.ship_by, '')) = $${idx++}`);
      params.push(shipByList[0]);
    } else if (shipByList.length > 1) {
      conditions.push(`TRIM(COALESCE(s.ship_by, '')) = ANY($${idx++}::text[])`);
      params.push(shipByList);
    }

    const fwdList = [...new Set([...(query.forwarder_names ?? [])].filter(Boolean))];
    if (fwdList.length === 1) {
      conditions.push(`LOWER(TRIM(COALESCE(s.forwarder_name, ''))) = LOWER($${idx++})`);
      params.push(fwdList[0]);
    } else if (fwdList.length > 1) {
      conditions.push(`LOWER(TRIM(COALESCE(s.forwarder_name, ''))) = ANY($${idx++}::text[])`);
      params.push(fwdList.map((v) => v.toLowerCase()));
    }

    const picList = [...new Set([...(query.pic_names ?? [])].filter(Boolean))];
    if (picList.length > 0) {
      conditions.push(`EXISTS (
        SELECT 1 FROM shipment_po_mapping m
        JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
        LEFT JOIN users u ON u.id::text = i.taken_by_user_id
        WHERE m.shipment_id = s.id AND TRIM(COALESCE(u.name, '')) = ANY($${idx++}::text[])
      )`);
      params.push(picList);
    }

    const etdList = [...new Set([...(query.etd_dates ?? [])].filter(Boolean))];
    if (etdList.length === 1) {
      conditions.push(`(s.etd AT TIME ZONE 'UTC')::date = $${idx++}::date`);
      params.push(etdList[0]);
    } else if (etdList.length > 1) {
      conditions.push(`(s.etd AT TIME ZONE 'UTC')::date = ANY($${idx++}::date[])`);
      params.push(etdList);
    }

    const etaList = [...new Set([...(query.eta_dates ?? [])].filter(Boolean))];
    if (etaList.length === 1) {
      conditions.push(`(s.eta AT TIME ZONE 'UTC')::date = $${idx++}::date`);
      params.push(etaList[0]);
    } else if (etaList.length > 1) {
      conditions.push(`(s.eta AT TIME ZONE 'UTC')::date = ANY($${idx++}::date[])`);
      params.push(etaList);
    }

    const originList = [...new Set([...(query.origin_port_names ?? [])].filter(Boolean))];
    if (originList.length === 1) {
      conditions.push(`TRIM(COALESCE(s.origin_port_name, '')) = $${idx++}`);
      params.push(originList[0]);
    } else if (originList.length > 1) {
      conditions.push(`TRIM(COALESCE(s.origin_port_name, '')) = ANY($${idx++}::text[])`);
      params.push(originList);
    }

    const destList = [...new Set([...(query.destination_port_names ?? [])].filter(Boolean))];
    if (destList.length === 1) {
      conditions.push(`TRIM(COALESCE(s.destination_port_name, '')) = $${idx++}`);
      params.push(destList[0]);
    } else if (destList.length > 1) {
      conditions.push(`TRIM(COALESCE(s.destination_port_name, '')) = ANY($${idx++}::text[])`);
      params.push(destList);
    }

    if (query.performance_eta_late) {
      conditions.push(`s.current_status <> 'DELIVERED'`);
      conditions.push(`s.eta IS NOT NULL`);
      conditions.push(`(s.eta AT TIME ZONE 'UTC')::date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`);
    }

    if (query.dormant_remaining_qty) {
      const days = query.dormant_days ?? 30;
      conditions.push(`s.updated_at < NOW() - ($${idx++}::int * INTERVAL '1 day')`);
      params.push(Math.max(1, Math.floor(days)));
      conditions.push(`EXISTS (
        SELECT 1
        FROM shipment_po_mapping m
        JOIN Import_purchase_order_items it ON it.import_purchase_order_id = m.intake_id
        WHERE m.shipment_id = s.id AND m.decoupled_at IS NULL
        AND COALESCE(it.qty, 0) > COALESCE((
          SELECT SUM(r.received_qty) FROM shipment_po_line_received r WHERE r.item_id = it.id
        ), 0)
      )`);
    }

    const where = conditions.join(" AND ");
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM shipments s WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.count ?? "0", 10);

    params.push(limit, offset);
    const result = await this.pool.query<ShipmentRow>(
      `SELECT s.id, s.shipment_no, s.vendor_code, s.vendor_name, s.forwarder_code, s.forwarder_name,
        s.warehouse_code, s.warehouse_name, s.incoterm, s.shipment_method,
        s.origin_port_code, s.origin_port_name, s.origin_port_country,
        s.destination_port_code, s.destination_port_name, s.destination_port_country,
        s.etd, s.eta, s.atd, s.ata, s.depo, s.depo_location, s.current_status, s.closed_at, s.close_reason, s.remarks, s.created_at, s.updated_at,
        s.pib_type, s.no_request_pib, s.ppjk_mkl, s.nopen, s.nopen_date, s.ship_by, s.bl_awb, s.insurance_no, s.coo,
        s.incoterm_amount, s.incoterm_currency, s.cbm, s.net_weight_mt, s.gross_weight_mt, s.bm, s.ppn_amount, s.pph_amount, s.kawasan_berikat, s.surveyor, s.product_classification,
        s.unit_20ft, s.unit_40ft, s.unit_package, s.unit_20_iso_tank, s.container_count_20ft, s.container_count_40ft,
        s.package_count, s.container_count_20_iso_tank
       FROM shipments s WHERE ${where} ${this.buildShipmentListOrderBy(query)} LIMIT $${idx} OFFSET $${idx + 1}`,
      params
    );

    return { rows: result.rows, total };
  }

  /**
   * Distinct values per column for shipment list filters (full database).
   */
  async listDistinctFilterOptions(): Promise<ShipmentListFilterOptions> {
    const [
      statusResult,
      shipmentNoResult,
      ptResult,
      plantResult,
      vendorResult,
      poNumResult,
      incotermResult,
      pibResult,
      methodResult,
      classResult,
      shipByResult,
      fwdResult,
      picResult,
      etdResult,
      etaResult,
      originResult,
      destResult,
    ] = await Promise.all([
      this.pool.query<{ s: string }>(
        `SELECT DISTINCT s.current_status AS s FROM shipments s WHERE s.deleted_at IS NULL ORDER BY s`
      ),
      this.pool.query<{ n: string }>(
        `SELECT DISTINCT s.shipment_no AS n FROM shipments s WHERE s.deleted_at IS NULL ORDER BY n`
      ),
      this.pool.query<{ pt: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.pt, '')) AS pt
         FROM Import_purchase_order i
         INNER JOIN shipment_po_mapping m ON m.intake_id = i.id AND m.decoupled_at IS NULL
         INNER JOIN shipments s ON s.id = m.shipment_id AND s.deleted_at IS NULL
         WHERE TRIM(COALESCE(i.pt, '')) <> ''
         ORDER BY pt`
      ),
      this.pool.query<{ plant: string }>(
        `SELECT DISTINCT TRIM(COALESCE(i.plant, '')) AS plant
         FROM Import_purchase_order i
         INNER JOIN shipment_po_mapping m ON m.intake_id = i.id AND m.decoupled_at IS NULL
         INNER JOIN shipments s ON s.id = m.shipment_id AND s.deleted_at IS NULL
         WHERE TRIM(COALESCE(i.plant, '')) <> ''
         ORDER BY plant`
      ),
      this.pool.query<{ v: string }>(
        `SELECT DISTINCT TRIM(COALESCE(s.vendor_name, '')) AS v
         FROM shipments s
         WHERE s.deleted_at IS NULL AND TRIM(COALESCE(s.vendor_name, '')) <> ''
         ORDER BY v`
      ),
      this.pool.query<{ po: string }>(
        `SELECT DISTINCT i.po_number AS po
         FROM Import_purchase_order i
         INNER JOIN shipment_po_mapping m ON m.intake_id = i.id AND m.decoupled_at IS NULL
         INNER JOIN shipments s ON s.id = m.shipment_id AND s.deleted_at IS NULL
         ORDER BY po`
      ),
      this.pool.query<{ inc: string }>(
        `SELECT DISTINCT TRIM(COALESCE(s.incoterm, '')) AS inc FROM shipments s
         WHERE s.deleted_at IS NULL AND TRIM(COALESCE(s.incoterm, '')) <> '' ORDER BY inc`
      ),
      this.pool.query<{ pib: string }>(
        `SELECT DISTINCT TRIM(COALESCE(s.pib_type, '')) AS pib FROM shipments s
         WHERE s.deleted_at IS NULL AND TRIM(COALESCE(s.pib_type, '')) <> '' ORDER BY pib`
      ),
      this.pool.query<{ sm: string }>(
        `SELECT DISTINCT TRIM(COALESCE(s.shipment_method, '')) AS sm FROM shipments s
         WHERE s.deleted_at IS NULL AND TRIM(COALESCE(s.shipment_method, '')) <> '' ORDER BY sm`
      ),
      this.pool.query<{ pc: string }>(
        `SELECT DISTINCT TRIM(COALESCE(s.product_classification, '')) AS pc FROM shipments s
         WHERE s.deleted_at IS NULL AND TRIM(COALESCE(s.product_classification, '')) <> '' ORDER BY pc`
      ),
      this.pool.query<{ sb: string }>(
        `SELECT DISTINCT TRIM(COALESCE(s.ship_by, '')) AS sb FROM shipments s
         WHERE s.deleted_at IS NULL AND TRIM(COALESCE(s.ship_by, '')) <> '' ORDER BY sb`
      ),
      this.pool.query<{ fn: string }>(
        `SELECT DISTINCT TRIM(COALESCE(s.forwarder_name, '')) AS fn FROM shipments s
         WHERE s.deleted_at IS NULL AND TRIM(COALESCE(s.forwarder_name, '')) <> '' ORDER BY fn`
      ),
      this.pool.query<{ pic: string }>(
        `SELECT DISTINCT TRIM(COALESCE(u.name, '')) AS pic
         FROM shipment_po_mapping m
         JOIN Import_purchase_order i ON i.id = m.intake_id AND m.decoupled_at IS NULL
         INNER JOIN shipments s ON s.id = m.shipment_id AND s.deleted_at IS NULL
         LEFT JOIN users u ON u.id::text = i.taken_by_user_id
         WHERE TRIM(COALESCE(u.name, '')) <> ''
         ORDER BY pic`
      ),
      this.pool.query<{ d: string }>(
        `SELECT DISTINCT to_char((s.etd AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS d
         FROM shipments s WHERE s.deleted_at IS NULL AND s.etd IS NOT NULL ORDER BY d`
      ),
      this.pool.query<{ d: string }>(
        `SELECT DISTINCT to_char((s.eta AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS d
         FROM shipments s WHERE s.deleted_at IS NULL AND s.eta IS NOT NULL ORDER BY d`
      ),
      this.pool.query<{ o: string }>(
        `SELECT DISTINCT TRIM(COALESCE(s.origin_port_name, '')) AS o FROM shipments s
         WHERE s.deleted_at IS NULL AND TRIM(COALESCE(s.origin_port_name, '')) <> '' ORDER BY o`
      ),
      this.pool.query<{ d: string }>(
        `SELECT DISTINCT TRIM(COALESCE(s.destination_port_name, '')) AS d FROM shipments s
         WHERE s.deleted_at IS NULL AND TRIM(COALESCE(s.destination_port_name, '')) <> '' ORDER BY d`
      ),
    ]);
    return {
      statuses: statusResult.rows.map((r) => r.s),
      shipment_numbers: shipmentNoResult.rows.map((r) => r.n),
      pts: ptResult.rows.map((r) => r.pt),
      plants: plantResult.rows.map((r) => r.plant),
      vendors: vendorResult.rows.map((r) => r.v),
      po_numbers: poNumResult.rows.map((r) => r.po),
      incoterms: incotermResult.rows.map((r) => r.inc),
      pib_types: pibResult.rows.map((r) => r.pib),
      shipment_methods: methodResult.rows.map((r) => r.sm),
      product_classifications: classResult.rows.map((r) => r.pc),
      ship_bys: shipByResult.rows.map((r) => r.sb),
      forwarder_names: fwdResult.rows.map((r) => r.fn),
      pic_names: picResult.rows.map((r) => r.pic),
      etd_dates: etdResult.rows.map((r) => r.d),
      eta_dates: etaResult.rows.map((r) => r.d),
      origin_port_names: originResult.rows.map((r) => r.o),
      destination_port_names: destResult.rows.map((r) => r.d),
    };
  }

  async update(id: string, dto: UpdateShipmentDto): Promise<ShipmentRow | null> {
    const updates: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let idx = 1;
    if (dto.etd !== undefined) {
      updates.push(`etd = $${idx++}`);
      params.push(dto.etd ? new Date(dto.etd) : null);
    }
    if (dto.eta !== undefined) {
      updates.push(`eta = $${idx++}`);
      params.push(dto.eta ? new Date(dto.eta) : null);
    }
    if (dto.atd !== undefined) {
      updates.push(`atd = $${idx++}`);
      params.push(dto.atd ? new Date(dto.atd) : null);
    }
    if (dto.ata !== undefined) {
      updates.push(`ata = $${idx++}`);
      params.push(dto.ata ? new Date(dto.ata) : null);
    }
    if (dto.depo !== undefined) {
      updates.push(`depo = $${idx++}`);
      params.push(dto.depo);
      if (dto.depo === false) {
        updates.push(`depo_location = $${idx++}`);
        params.push(null);
      }
    }
    if (dto.depo_location !== undefined && dto.depo !== false) {
      if (dto.depo === true || dto.depo === undefined) {
        updates.push(`depo_location = $${idx++}`);
        params.push(dto.depo_location);
      }
    }
    if (dto.remarks !== undefined) {
      updates.push(`remarks = $${idx++}`);
      params.push(dto.remarks);
    }
    if (dto.pib_type !== undefined) {
      updates.push(`pib_type = $${idx++}`);
      params.push(dto.pib_type);
    }
    if (dto.no_request_pib !== undefined) {
      updates.push(`no_request_pib = $${idx++}`);
      params.push(dto.no_request_pib);
    }
    if (dto.ppjk_mkl !== undefined) {
      updates.push(`ppjk_mkl = $${idx++}`);
      params.push(dto.ppjk_mkl);
    }
    if (dto.nopen !== undefined) {
      updates.push(`nopen = $${idx++}`);
      params.push(dto.nopen);
    }
    if (dto.nopen_date !== undefined) {
      updates.push(`nopen_date = $${idx++}`);
      params.push(dto.nopen_date ? new Date(dto.nopen_date) : null);
    }
    if (dto.ship_by !== undefined) {
      updates.push(`ship_by = $${idx++}`);
      params.push(dto.ship_by);
    }
    if (dto.bl_awb !== undefined) {
      updates.push(`bl_awb = $${idx++}`);
      params.push(dto.bl_awb);
    }
    if (dto.insurance_no !== undefined) {
      updates.push(`insurance_no = $${idx++}`);
      params.push(dto.insurance_no);
    }
    if (dto.coo !== undefined) {
      updates.push(`coo = $${idx++}`);
      params.push(dto.coo);
    }
    if (dto.incoterm_amount !== undefined) {
      updates.push(`incoterm_amount = $${idx++}`);
      params.push(dto.incoterm_amount);
    }
    if (dto.incoterm_currency !== undefined) {
      updates.push(`incoterm_currency = $${idx++}`);
      params.push(dto.incoterm_currency);
    }
    if (dto.cbm !== undefined) {
      updates.push(`cbm = $${idx++}`);
      params.push(dto.cbm);
    }
    if (dto.net_weight_mt !== undefined) {
      updates.push(`net_weight_mt = $${idx++}`);
      params.push(dto.net_weight_mt);
    }
    if (dto.gross_weight_mt !== undefined) {
      updates.push(`gross_weight_mt = $${idx++}`);
      params.push(dto.gross_weight_mt);
    }
    if (dto.bm !== undefined) {
      updates.push(`bm = $${idx++}`);
      params.push(dto.bm);
    }
    if (dto.ppn_amount !== undefined) {
      updates.push(`ppn_amount = $${idx++}`);
      params.push(dto.ppn_amount);
    }
    if (dto.pph_amount !== undefined) {
      updates.push(`pph_amount = $${idx++}`);
      params.push(dto.pph_amount);
    }
    if (dto.origin_port_name !== undefined) {
      updates.push(`origin_port_name = $${idx++}`);
      params.push(dto.origin_port_name);
    }
    if (dto.origin_port_country !== undefined) {
      updates.push(`origin_port_country = $${idx++}`);
      params.push(dto.origin_port_country);
    }
    if (dto.forwarder_name !== undefined) {
      updates.push(`forwarder_name = $${idx++}`);
      params.push(dto.forwarder_name);
    }
    if (dto.shipment_method !== undefined) {
      updates.push(`shipment_method = $${idx++}`);
      params.push(dto.shipment_method);
    }
    if (dto.destination_port_name !== undefined) {
      updates.push(`destination_port_name = $${idx++}`);
      params.push(dto.destination_port_name);
    }
    if (dto.destination_port_country !== undefined) {
      updates.push(`destination_port_country = $${idx++}`);
      params.push(dto.destination_port_country);
    }
    if (dto.vendor_name !== undefined) {
      updates.push(`vendor_name = $${idx++}`);
      params.push(dto.vendor_name);
    }
    if (dto.warehouse_name !== undefined) {
      updates.push(`warehouse_name = $${idx++}`);
      params.push(dto.warehouse_name);
    }
    if (dto.incoterm !== undefined) {
      updates.push(`incoterm = $${idx++}`);
      params.push(dto.incoterm);
    }
    if (dto.kawasan_berikat !== undefined) {
      updates.push(`kawasan_berikat = $${idx++}`);
      params.push(dto.kawasan_berikat);
    }
    if (dto.surveyor !== undefined) {
      updates.push(`surveyor = $${idx++}`);
      params.push(dto.surveyor);
    }
    if (dto.product_classification !== undefined) {
      updates.push(`product_classification = $${idx++}`);
      params.push(dto.product_classification);
    }
    if (dto.closed_at !== undefined) {
      updates.push(`closed_at = $${idx++}`);
      params.push(dto.closed_at ? new Date(dto.closed_at) : null);
    }
    if (dto.close_reason !== undefined) {
      updates.push(`close_reason = $${idx++}`);
      params.push(dto.close_reason);
    }
    if (dto.unit_20ft !== undefined) {
      updates.push(`unit_20ft = $${idx++}`);
      params.push(dto.unit_20ft);
      if (dto.unit_20ft === false) {
        updates.push(`container_count_20ft = $${idx++}`);
        params.push(null);
      }
    }
    if (dto.unit_40ft !== undefined) {
      updates.push(`unit_40ft = $${idx++}`);
      params.push(dto.unit_40ft);
      if (dto.unit_40ft === false) {
        updates.push(`container_count_40ft = $${idx++}`);
        params.push(null);
      }
    }
    if (dto.unit_package !== undefined) {
      updates.push(`unit_package = $${idx++}`);
      params.push(dto.unit_package);
      if (dto.unit_package === false) {
        updates.push(`package_count = $${idx++}`);
        params.push(null);
      }
    }
    if (dto.unit_20_iso_tank !== undefined) {
      updates.push(`unit_20_iso_tank = $${idx++}`);
      params.push(dto.unit_20_iso_tank);
      if (dto.unit_20_iso_tank === false) {
        updates.push(`container_count_20_iso_tank = $${idx++}`);
        params.push(null);
      }
    }
    if (dto.container_count_20ft !== undefined && dto.unit_20ft !== false) {
      updates.push(`container_count_20ft = $${idx++}`);
      params.push(dto.container_count_20ft);
    }
    if (dto.container_count_40ft !== undefined && dto.unit_40ft !== false) {
      updates.push(`container_count_40ft = $${idx++}`);
      params.push(dto.container_count_40ft);
    }
    if (dto.package_count !== undefined && dto.unit_package !== false) {
      updates.push(`package_count = $${idx++}`);
      params.push(dto.package_count);
    }
    if (dto.container_count_20_iso_tank !== undefined && dto.unit_20_iso_tank !== false) {
      updates.push(`container_count_20_iso_tank = $${idx++}`);
      params.push(dto.container_count_20_iso_tank);
    }
    if (params.length === 0) return this.findById(id);
    params.push(id);
    const result = await this.pool.query<ShipmentRow>(
      `UPDATE shipments SET ${updates.join(", ")} WHERE id = $${idx} AND deleted_at IS NULL RETURNING ${this.selectColumns}`,
      params
    );
    return result.rows[0] ?? null;
  }

  async close(id: string, reason: string | null): Promise<ShipmentRow | null> {
    const result = await this.pool.query<ShipmentRow>(
      `UPDATE shipments SET closed_at = NOW(), close_reason = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING ${this.selectColumns}`,
      [reason, id]
    );
    return result.rows[0] ?? null;
  }

  async updateCurrentStatus(id: string, currentStatus: string): Promise<ShipmentRow | null> {
    const result = await this.pool.query<ShipmentRow>(
      `UPDATE shipments SET current_status = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING ${this.selectColumns}`,
      [currentStatus, id]
    );
    return result.rows[0] ?? null;
  }

  /** Persist system-calculated BM (not exposed on public update API). */
  async updateComputedBm(id: string, bm: number): Promise<void> {
    await this.pool.query(`UPDATE shipments SET bm = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL`, [
      bm,
      id,
    ]);
  }

  /** Soft delete: row stays in DB; operational queries exclude `deleted_at IS NULL`. */
  async softDelete(id: string, deletedBy: string | null): Promise<ShipmentRow | null> {
    const result = await this.pool.query<ShipmentRow>(
      `UPDATE shipments SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${this.selectColumns}`,
      [id, deletedBy]
    );
    return result.rows[0] ?? null;
  }

  async createShipmentImportHistory(input: {
    fileName: string | null;
    uploadedBy: string;
    totalRows: number;
    importedShipments: number;
    importedRows: number;
    failedRows: number;
    status: "SUCCESS" | "PARTIAL" | "FAILED";
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO shipment_import_history
       (file_name, uploaded_by, total_rows, imported_shipments, imported_rows, failed_rows, status, created_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [
        input.fileName,
        input.uploadedBy,
        input.totalRows,
        input.importedShipments,
        input.importedRows,
        input.failedRows,
        input.status,
      ]
    );
  }

  async listShipmentImportHistory(limit = 20): Promise<ShipmentImportHistoryRow[]> {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const result = await this.pool.query<ShipmentImportHistoryRow>(
      `SELECT id, file_name, uploaded_by, total_rows, imported_shipments, imported_rows, failed_rows, status, created_at, finished_at
       FROM shipment_import_history
       ORDER BY created_at DESC
       LIMIT $1`,
      [safeLimit]
    );
    return result.rows;
  }
}

