/**
 * Shipment-PO mapping repository: couple/decouple with audit trail.
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import type { ShipmentListLinkedPo, ShipmentListPoLineItem, ShipmentPoMappingRow } from "../dto/index.js";

export interface LinkedPoWithIntake {
  intake_id: string;
  po_number: string;
  pt: string | null;
  plant: string | null;
  supplier_name: string;
  incoterm_location: string | null;
  currency: string | null;
  invoice_no: string | null;
  currency_rate: number | null;
  taken_by_name: string | null;
  coupled_at: Date;
  coupled_by: string;
}

/** For PO detail: shipments linked to a given intake (PO). */
export interface LinkedShipmentByIntake {
  shipment_id: string;
  shipment_number: string;
  current_status: string;
  /** Shipment incoterm — used for PO status (PICKED_UP position in lifecycle chain). */
  incoterm: string | null;
  coupled_at: Date;
  coupled_by: string;
  atd: Date | null;
  ata: Date | null;
  /** When shipment was closed / delivered (same as shipment.closed_at). */
  closed_at: Date | null;
}

export class ShipmentPoMappingRepository {
  private get pool(): Pool {
    return getPool();
  }

  /** Currently coupled mappings only (decoupled_at IS NULL). */
  async findActiveByShipmentId(shipmentId: string): Promise<LinkedPoWithIntake[]> {
    const result = await this.pool.query<LinkedPoWithIntake>(
      `SELECT m.intake_id, i.po_number, i.pt, i.plant, i.supplier_name, i.incoterm_location, i.currency,
         m.invoice_no, m.currency_rate, u.name AS taken_by_name, m.coupled_at, m.coupled_by
       FROM shipment_po_mapping m
       JOIN Import_purchase_order i ON i.id = m.intake_id
       LEFT JOIN users u ON u.id::text = i.taken_by_user_id
       WHERE m.shipment_id = $1 AND m.decoupled_at IS NULL
       ORDER BY m.coupled_at ASC`,
      [shipmentId]
    );
    return result.rows;
  }

  /** Update invoice_no and/or currency_rate for a coupled PO. */
  async updateMapping(
    shipmentId: string,
    intakeId: string,
    data: { invoice_no?: string | null; currency_rate?: number | null }
  ): Promise<boolean> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (data.invoice_no !== undefined) {
      updates.push(`invoice_no = $${idx++}`);
      params.push(data.invoice_no);
    }
    if (data.currency_rate !== undefined) {
      updates.push(`currency_rate = $${idx++}`);
      params.push(data.currency_rate);
    }
    if (updates.length === 0) return true;
    params.push(shipmentId, intakeId);
    const result = await this.pool.query(
      `UPDATE shipment_po_mapping SET ${updates.join(", ")} WHERE shipment_id = $${idx} AND intake_id = $${idx + 1} AND decoupled_at IS NULL`,
      params
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Shipments currently linked to this PO (intake). Used for PO detail page. */
  async findActiveShipmentsByIntakeId(intakeId: string): Promise<LinkedShipmentByIntake[]> {
    const result = await this.pool.query<LinkedShipmentByIntake>(
      `SELECT m.shipment_id, s.shipment_no AS shipment_number, s.current_status, s.incoterm, m.coupled_at, m.coupled_by,
              s.atd, s.ata, s.closed_at
       FROM shipment_po_mapping m
       JOIN shipments s ON s.id = m.shipment_id
       WHERE m.intake_id = $1 AND m.decoupled_at IS NULL AND s.deleted_at IS NULL
       ORDER BY m.coupled_at ASC`,
      [intakeId]
    );
    return result.rows;
  }

  /** Decouple every active PO from this shipment (e.g. before soft-delete). Returns affected intake ids. */
  async decoupleAllActiveForShipment(
    shipmentId: string,
    decoupledBy: string,
    reason: string | null
  ): Promise<string[]> {
    const result = await this.pool.query<{ intake_id: string }>(
      `UPDATE shipment_po_mapping
       SET decoupled_at = NOW(), decoupled_by = $2, decouple_reason = $3
       WHERE shipment_id = $1 AND decoupled_at IS NULL
       RETURNING intake_id`,
      [shipmentId, decoupledBy, reason]
    );
    return result.rows.map((r) => r.intake_id);
  }

  /**
   * Active linked POs with line summaries for many shipments (list view).
   * Ordered by coupled_at per shipment.
   */
  async findActiveLinkedPosWithItemsByShipmentIds(shipmentIds: string[]): Promise<Map<string, ShipmentListLinkedPo[]>> {
    const map = new Map<string, ShipmentListLinkedPo[]>();
    if (shipmentIds.length === 0) return map;
    const result = await this.pool.query<{
      shipment_id: string;
      intake_id: string;
      po_number: string;
      pt: string | null;
      plant: string | null;
      taken_by_name: string | null;
      currency: string | null;
      intake_status: string | null;
      items: ShipmentListPoLineItem[] | null;
    }>(
      `SELECT m.shipment_id, m.intake_id, i.po_number, i.pt, i.plant, u.name AS taken_by_name,
        i.currency, i.intake_status,
        COALESCE(
          (SELECT json_agg(
            json_build_object(
              'item_description', it.item_description,
              'qty_po', it.qty,
              'delivery_qty', r.received_qty,
              'unit', it.unit,
              'bm_percentage', r.bm_percentage,
              'ppn_percentage', r.ppn_percentage,
              'pph_percentage', r.pph_percentage
            ) ORDER BY it.line_number
          )
          FROM Import_purchase_order_items it
          LEFT JOIN shipment_po_line_received r
            ON r.shipment_id = m.shipment_id
            AND r.intake_id = m.intake_id
            AND r.item_id = it.id
          WHERE it.import_purchase_order_id = m.intake_id),
          '[]'::json
        ) AS items
       FROM shipment_po_mapping m
       JOIN Import_purchase_order i ON i.id = m.intake_id
       LEFT JOIN users u ON u.id::text = i.taken_by_user_id
       WHERE m.shipment_id = ANY($1::uuid[]) AND m.decoupled_at IS NULL
       ORDER BY m.shipment_id, m.coupled_at ASC`,
      [shipmentIds]
    );
    for (const row of result.rows) {
      const list = map.get(row.shipment_id) ?? [];
      const items = Array.isArray(row.items) ? row.items : [];
      list.push({
        intake_id: row.intake_id,
        po_number: row.po_number,
        pt: row.pt,
        plant: row.plant,
        taken_by_name: row.taken_by_name,
        currency: row.currency ?? null,
        intake_status: row.intake_status ?? null,
        items,
      });
      map.set(row.shipment_id, list);
    }
    return map;
  }

  /** Count currently coupled POs for a shipment. */
  async countActiveByShipmentId(shipmentId: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM shipment_po_mapping
       WHERE shipment_id = $1 AND decoupled_at IS NULL`,
      [shipmentId]
    );
    return parseInt(result.rows[0]?.count ?? "0", 10);
  }

  /** Check if intake is already coupled to this shipment (active). */
  async isCoupled(shipmentId: string, intakeId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM shipment_po_mapping
       WHERE shipment_id = $1 AND intake_id = $2 AND decoupled_at IS NULL`,
      [shipmentId, intakeId]
    );
    return result.rows.length > 0;
  }

  /** Couple one intake to shipment. Fails if already coupled (unique). */
  async couple(shipmentId: string, intakeId: string, coupledBy: string): Promise<ShipmentPoMappingRow> {
    const result = await this.pool.query<ShipmentPoMappingRow>(
      `INSERT INTO shipment_po_mapping (shipment_id, intake_id, coupled_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (shipment_id, intake_id) DO UPDATE SET
         decoupled_at = NULL, decoupled_by = NULL, decouple_reason = NULL, coupled_at = NOW(), coupled_by = $3
       RETURNING id, shipment_id, intake_id, coupled_at, coupled_by, decoupled_at, decoupled_by, decouple_reason, created_at`,
      [shipmentId, intakeId, coupledBy]
    );
    if (!result.rows[0]) throw new Error("ShipmentPoMappingRepository.couple: no row returned");
    return result.rows[0];
  }

  /** All PO mappings for a shipment (including decoupled), for activity log. */
  async findAllMappingsWithPoByShipmentId(shipmentId: string): Promise<
    Array<{
      mapping_id: string;
      intake_id: string;
      po_number: string;
      coupled_at: Date;
      coupled_by: string;
      decoupled_at: Date | null;
      decoupled_by: string | null;
      decouple_reason: string | null;
    }>
  > {
    const result = await this.pool.query<{
      mapping_id: string;
      intake_id: string;
      po_number: string;
      coupled_at: Date;
      coupled_by: string;
      decoupled_at: Date | null;
      decoupled_by: string | null;
      decouple_reason: string | null;
    }>(
      `SELECT m.id AS mapping_id, m.intake_id, i.po_number, m.coupled_at, m.coupled_by,
              m.decoupled_at, m.decoupled_by, m.decouple_reason
       FROM shipment_po_mapping m
       JOIN Import_purchase_order i ON i.id = m.intake_id
       WHERE m.shipment_id = $1
       ORDER BY m.coupled_at ASC`,
      [shipmentId]
    );
    return result.rows;
  }

  /** Decouple intake from shipment (audit: set decoupled_at, decoupled_by, reason). */
  async decouple(shipmentId: string, intakeId: string, decoupledBy: string, reason: string | null): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE shipment_po_mapping
       SET decoupled_at = NOW(), decoupled_by = $1, decouple_reason = $2
       WHERE shipment_id = $3 AND intake_id = $4 AND decoupled_at IS NULL`,
      [decoupledBy, reason, shipmentId, intakeId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** All shipment mappings for an intake (including decoupled), for PO activity log. */
  async findAllMappingsWithShipmentByIntakeId(intakeId: string): Promise<
    Array<{
      mapping_id: string;
      shipment_id: string;
      shipment_no: string;
      coupled_at: Date;
      coupled_by: string;
      decoupled_at: Date | null;
      decoupled_by: string | null;
      decouple_reason: string | null;
    }>
  > {
    const result = await this.pool.query<{
      mapping_id: string;
      shipment_id: string;
      shipment_no: string;
      coupled_at: Date;
      coupled_by: string;
      decoupled_at: Date | null;
      decoupled_by: string | null;
      decouple_reason: string | null;
    }>(
      `SELECT m.id AS mapping_id, m.shipment_id, s.shipment_no, m.coupled_at, m.coupled_by,
              m.decoupled_at, m.decoupled_by, m.decouple_reason
       FROM shipment_po_mapping m
       JOIN shipments s ON s.id = m.shipment_id
       WHERE m.intake_id = $1
       ORDER BY m.coupled_at ASC`,
      [intakeId]
    );
    return result.rows;
  }
}
