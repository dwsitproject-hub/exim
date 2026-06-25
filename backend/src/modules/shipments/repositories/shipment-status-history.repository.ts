/**
 * Shipment status history repository: persistence only.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "../../../db/index.js";
import type { ShipmentStatusHistoryRow } from "../dto/index.js";

export interface CreateShipmentStatusHistoryInput {
  shipmentId: string;
  previousStatus: string | null;
  newStatus: string;
  remarks: string | null;
  changedBy: string;
}

export class ShipmentStatusHistoryRepository {
  private get pool(): Pool {
    return getPool();
  }

  async create(
    input: CreateShipmentStatusHistoryInput,
    client?: PoolClient
  ): Promise<ShipmentStatusHistoryRow> {
    const db: Pool | PoolClient = client ?? this.pool;
    const result = await db.query<ShipmentStatusHistoryRow>(
      `INSERT INTO shipment_status_history
       (id, shipment_id, previous_status, new_status, remarks, changed_by, changed_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING id, shipment_id, previous_status, new_status, remarks, changed_by, changed_at`,
      [
        input.shipmentId,
        input.previousStatus,
        input.newStatus,
        input.remarks,
        input.changedBy,
      ]
    );
    if (!result.rows[0]) throw new Error("ShipmentStatusHistoryRepository.create: no row returned");
    return result.rows[0];
  }

  async findByShipmentId(shipmentId: string): Promise<ShipmentStatusHistoryRow[]> {
    const result = await this.pool.query<ShipmentStatusHistoryRow>(
      `SELECT id, shipment_id, previous_status, new_status, remarks, changed_by, changed_at
       FROM shipment_status_history
       WHERE shipment_id = $1
       ORDER BY changed_at ASC`,
      [shipmentId]
    );
    return result.rows;
  }
}
