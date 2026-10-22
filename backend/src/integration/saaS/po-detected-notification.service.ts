/**
 * In-app notifications for Syncera PO detect / amend.
 */

import { getPool } from "../../db/index.js";
import { IMPORT_PO_DETECTED_ROLES } from "../../shared/rbac.js";
import { logger } from "../../utils/logger.js";
import { NotificationRepository } from "../../modules/notifications/repositories/notification.repository.js";

const notificationRepo = new NotificationRepository();

export async function notifyImportOfficers(args: {
  type: "po_detected" | "po_amended";
  intakeId: string;
  poNumber: string;
  supplierName?: string;
}): Promise<void> {
  const pool = getPool();
  const users = await pool.query<{ id: string }>(
    `SELECT id FROM users
     WHERE is_active = true
       AND UPPER(TRIM(role)) = ANY($1::text[])`,
    [IMPORT_PO_DETECTED_ROLES]
  );
  if (users.rows.length === 0) return;
  const message =
    args.type === "po_detected"
      ? `New import PO detected: ${args.poNumber}${args.supplierName ? ` — ${args.supplierName}` : ""}`
      : `Import PO updated from Syncera: ${args.poNumber}`;
  try {
    await notificationRepo.insertPoSyncNotifications(
      users.rows.map((u) => ({
        userId: u.id,
        type: args.type,
        intakeId: args.intakeId,
        message,
      }))
    );
  } catch (err) {
    logger.warn("Failed to insert Syncera PO notification", { error: String(err), type: args.type });
  }
}
