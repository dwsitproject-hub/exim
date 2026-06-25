/**
 * In-app notifications for import shipments: ETA H-3, H-2, and H-1.
 * Recipients: all active Import / Exim Officers. Calendar dates use Asia/Jakarta. Skips DELIVERED only.
 */

import type { PoolClient } from "pg";
import { getPool } from "../../../db/index.js";
import { IMPORT_ETA_REMINDER_ROLES } from "../../../shared/rbac.js";
import { logger } from "../../../utils/logger.js";
import { NotificationRepository } from "../../notifications/repositories/notification.repository.js";
import {
  buildEtaReminderMessage,
  etaReminderDaysAhead,
  etaReminderNotificationType,
  type EtaReminderKind,
} from "../utils/shipment-eta-reminder-messages.js";

export interface EtaReminderCandidateRow {
  shipment_id: string;
  shipment_no: string;
  po_numbers: string | null;
  eta_date: string;
  user_id: string;
}

const notificationRepo = new NotificationRepository();

const CANDIDATES_SQL = `
  WITH shipments_due AS (
    SELECT
      s.id AS shipment_id,
      s.shipment_no,
      to_char((s.eta AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS eta_date,
      NULLIF(
        string_agg(DISTINCT TRIM(i.po_number), ', ' ORDER BY TRIM(i.po_number)),
        ''
      ) AS po_numbers
    FROM shipments s
    LEFT JOIN shipment_po_mapping m ON m.shipment_id = s.id AND m.decoupled_at IS NULL
    LEFT JOIN Import_purchase_order i ON i.id = m.intake_id
    WHERE s.deleted_at IS NULL
      AND UPPER(TRIM(COALESCE(s.current_status, ''))) <> 'DELIVERED'
      AND s.eta IS NOT NULL
      AND (s.eta AT TIME ZONE 'Asia/Jakarta')::date = (NOW() AT TIME ZONE 'Asia/Jakarta')::date + $1::int
    GROUP BY s.id, s.shipment_no, s.eta
  )
  SELECT
    sd.shipment_id,
    sd.shipment_no,
    sd.po_numbers,
    sd.eta_date,
    u.id AS user_id
  FROM shipments_due sd
  CROSS JOIN users u
  WHERE u.is_active = true
    AND UPPER(TRIM(u.role)) = ANY($2::text[])
    AND NOT EXISTS (
      SELECT 1 FROM shipment_eta_notification_log l
      WHERE l.shipment_id = sd.shipment_id
        AND l.user_id = u.id
        AND l.reminder_kind = $3
        AND l.eta_date = sd.eta_date::date
    )
`;

async function findCandidates(kind: EtaReminderKind): Promise<EtaReminderCandidateRow[]> {
  const pool = getPool();
  const result = await pool.query<EtaReminderCandidateRow>(CANDIDATES_SQL, [
    etaReminderDaysAhead(kind),
    IMPORT_ETA_REMINDER_ROLES,
    kind,
  ]);
  return result.rows;
}

async function insertLogRows(
  client: PoolClient,
  rows: { shipmentId: string; userId: string; reminderKind: EtaReminderKind; etaDate: string }[]
): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let p = 1;
  for (const r of rows) {
    placeholders.push(`($${p++}::uuid, $${p++}::uuid, $${p++}, $${p++}::date)`);
    values.push(r.shipmentId, r.userId, r.reminderKind, r.etaDate);
  }
  await client.query(
    `INSERT INTO shipment_eta_notification_log (shipment_id, user_id, reminder_kind, eta_date)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (shipment_id, user_id, reminder_kind, eta_date) DO NOTHING`,
    values
  );
}

async function processKind(kind: EtaReminderKind): Promise<number> {
  const candidates = await findCandidates(kind);
  if (candidates.length === 0) return 0;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const notifRows = candidates.map((c) => ({
      userId: c.user_id,
      shipmentId: c.shipment_id,
      type: etaReminderNotificationType(kind),
      message: buildEtaReminderMessage(c.shipment_no, c.po_numbers, c.eta_date, kind),
    }));

    await notificationRepo.insertEtaReminderNotifications(client, notifRows);
    await insertLogRows(
      client,
      candidates.map((c) => ({
        shipmentId: c.shipment_id,
        userId: c.user_id,
        reminderKind: kind,
        etaDate: c.eta_date,
      }))
    );

    await client.query("COMMIT");
    return candidates.length;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Run H-3, H-2, then H-1 reminder cycle (idempotent per shipment / user / ETA date). */
export async function runShipmentEtaReminderCycle(): Promise<{ h3: number; h2: number; h1: number }> {
  try {
    const h3 = await processKind("h3");
    const h2 = await processKind("h2");
    const h1 = await processKind("h1");
    if (h3 > 0 || h2 > 0 || h1 > 0) {
      logger.info("Shipment ETA reminder cycle completed", { h3, h2, h1 });
    }
    return { h3, h2, h1 };
  } catch (err) {
    logger.error("Shipment ETA reminder cycle failed", { error: String(err) });
    return { h3: 0, h2: 0, h1: 0 };
  }
}
