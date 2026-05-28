/**
 * Shipment notes (comments) — persistence only.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "../../../db/index.js";

export interface ShipmentNoteRow {
  id: string;
  shipment_id: string;
  note: string;
  created_by_user_id: string | null;
  created_by_name: string;
  created_at: Date;
}

export class ShipmentNoteRepository {
  private get pool(): Pool {
    return getPool();
  }

  async listByShipmentId(shipmentId: string): Promise<ShipmentNoteRow[]> {
    const result = await this.pool.query<ShipmentNoteRow>(
      `SELECT id, shipment_id, note, created_by_user_id, created_by_name, created_at
       FROM shipment_notes
       WHERE shipment_id = $1
       ORDER BY created_at DESC`,
      [shipmentId]
    );
    return result.rows;
  }

  async create(
    shipmentId: string,
    note: string,
    createdByUserId: string | null,
    createdByName: string
  ): Promise<ShipmentNoteRow> {
    const result = await this.pool.query<ShipmentNoteRow>(
      `INSERT INTO shipment_notes (shipment_id, note, created_by_user_id, created_by_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, shipment_id, note, created_by_user_id, created_by_name, created_at`,
      [shipmentId, note, createdByUserId, createdByName]
    );
    const row = result.rows[0];
    if (!row) throw new Error("ShipmentNoteRepository.create: no row returned");
    return row;
  }

  async createWithClient(
    client: PoolClient,
    shipmentId: string,
    note: string,
    createdByUserId: string | null,
    createdByName: string
  ): Promise<ShipmentNoteRow> {
    const result = await client.query<ShipmentNoteRow>(
      `INSERT INTO shipment_notes (shipment_id, note, created_by_user_id, created_by_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, shipment_id, note, created_by_user_id, created_by_name, created_at`,
      [shipmentId, note, createdByUserId, createdByName]
    );
    const row = result.rows[0];
    if (!row) throw new Error("ShipmentNoteRepository.createWithClient: no row returned");
    return row;
  }

  async insertMentionsWithClient(client: PoolClient, noteId: string, mentionedUserIds: string[]): Promise<void> {
    if (mentionedUserIds.length === 0) return;
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const uid of mentionedUserIds) {
      placeholders.push(`($${p++}::uuid, $${p++}::uuid)`);
      values.push(noteId, uid);
    }
    await client.query(
      `INSERT INTO shipment_note_mentions (note_id, mentioned_user_id) VALUES ${placeholders.join(", ")}
       ON CONFLICT DO NOTHING`,
      values
    );
  }
}
