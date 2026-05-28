/**
 * In-app notifications — persistence.
 */

import type { Pool, PoolClient } from "pg";
import { getPool } from "../../../db/index.js";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  reference_id: string;
  shipment_id: string | null;
  message: string;
  read_at: Date | null;
  created_at: Date;
}

export class NotificationRepository {
  private get pool(): Pool {
    return getPool();
  }

  async insertMentionNotifications(
    client: PoolClient,
    rows: { userId: string; noteId: string; shipmentId: string; message: string }[]
  ): Promise<void> {
    if (rows.length === 0) return;
    const values: unknown[] = [];
    const placeholders: string[] = [];
    let p = 1;
    for (const r of rows) {
      placeholders.push(`($${p++}::uuid, $${p++}, $${p++}::uuid, $${p++}::uuid, $${p++})`);
      values.push(r.userId, "mention", r.noteId, r.shipmentId, r.message);
    }
    await client.query(
      `INSERT INTO notifications (user_id, type, reference_id, shipment_id, message)
       VALUES ${placeholders.join(", ")}`,
      values
    );
  }

  async listForUser(
    userId: string,
    options: { limit: number; unreadOnly: boolean }
  ): Promise<NotificationRow[]> {
    const lim = Math.min(Math.max(1, options.limit), 100);
    const unreadOnly = options.unreadOnly;
    const result = await this.pool.query<NotificationRow>(
      `SELECT id, user_id, type, reference_id, shipment_id, message, read_at, created_at
       FROM notifications
       WHERE user_id = $1::uuid
         AND (NOT $2::boolean OR read_at IS NULL)
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, unreadOnly, lim]
    );
    return result.rows;
  }

  async countUnread(userId: string): Promise<number> {
    const result = await this.pool.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM notifications WHERE user_id = $1::uuid AND read_at IS NULL`,
      [userId]
    );
    return parseInt(result.rows[0]?.c ?? "0", 10);
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE notifications SET read_at = NOW() WHERE id = $1::uuid AND user_id = $2::uuid AND read_at IS NULL`,
      [notificationId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.pool.query(
      `UPDATE notifications SET read_at = NOW() WHERE user_id = $1::uuid AND read_at IS NULL`,
      [userId]
    );
    return result.rowCount ?? 0;
  }
}
