/**
 * Per-shipment per-PO-line received quantity. 1 PO can be delivered across multiple shipments.
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";

export interface LineReceivedRow {
  item_id: string;
  received_qty: number;
  item_description: string | null;
  bm_percentage: number | null;
  ppn_percentage: number | null;
  pph_percentage: number | null;
}

export class ShipmentPoLineReceivedRepository {
  private get pool(): Pool {
    return getPool();
  }

  async findByShipmentAndIntake(shipmentId: string, intakeId: string): Promise<LineReceivedRow[]> {
    const result = await this.pool.query<LineReceivedRow>(
      `SELECT item_id, received_qty, item_description,
         bm_percentage, ppn_percentage, pph_percentage
       FROM shipment_po_line_received
       WHERE shipment_id = $1 AND intake_id = $2`,
      [shipmentId, intakeId]
    );
    return result.rows;
  }

  /**
   * Total delivered qty for this PO line across all shipments that are **still coupled** to this PO
   * (`shipment_po_mapping.decoupled_at IS NULL`). No filter on shipment status — amounts on in-progress
   * shipments count the same as delivered ones. Excludes rows left after decouple (no active mapping).
   */
  async getTotalReceivedByIntakeItem(intakeId: string, itemId: string): Promise<number> {
    const result = await this.pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(r.received_qty), 0)::text AS total
       FROM shipment_po_line_received r
       INNER JOIN shipment_po_mapping m
         ON m.shipment_id = r.shipment_id
         AND m.intake_id = r.intake_id
         AND m.decoupled_at IS NULL
       WHERE r.intake_id = $1 AND r.item_id = $2`,
      [intakeId, itemId]
    );
    const total = result.rows[0]?.total;
    return total != null ? parseFloat(total) : 0;
  }

  /** Set received qty for one line. Inserts or updates. */
  async upsert(
    shipmentId: string,
    intakeId: string,
    itemId: string,
    receivedQty: number,
    itemDescription: string | null = null
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO shipment_po_line_received (shipment_id, intake_id, item_id, received_qty, item_description, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (shipment_id, intake_id, item_id) DO UPDATE SET
         received_qty = EXCLUDED.received_qty,
         item_description = EXCLUDED.item_description,
         updated_at = NOW()`,
      [shipmentId, intakeId, itemId, receivedQty, itemDescription]
    );
  }

  /** Set received qtys for all lines of one PO on this shipment. Replaces existing. */
  async setLines(
    shipmentId: string,
    intakeId: string,
    lines: {
      item_id: string;
      received_qty: number;
      item_description?: string | null;
      bm_percentage?: number | null;
      ppn_percentage?: number | null;
      pph_percentage?: number | null;
    }[]
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `DELETE FROM shipment_po_line_received WHERE shipment_id = $1 AND intake_id = $2`,
        [shipmentId, intakeId]
      );
      for (const line of lines) {
        await client.query(
          `INSERT INTO shipment_po_line_received (
             shipment_id, intake_id, item_id, received_qty, item_description,
             bm_percentage, ppn_percentage, pph_percentage, updated_at
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
          [
            shipmentId,
            intakeId,
            line.item_id,
            line.received_qty,
            line.item_description ?? null,
            line.bm_percentage ?? null,
            line.ppn_percentage ?? null,
            line.pph_percentage ?? null,
          ]
        );
      }
    } finally {
      client.release();
    }
  }
}
