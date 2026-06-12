/**
 * In-app notifications when required sent-document dates are missing.
 */

import { getPool } from "../../../db/index.js";
import { PERMISSIONS, userHasPermission } from "../../../shared/rbac.js";
import { UserRepository } from "../../auth/repositories/user.repository.js";
import { NotificationRepository } from "../../notifications/repositories/notification.repository.js";
import type { ExportBulkingShipmentRow } from "../dto/index.js";
import {
  getMissingRequiredSentDocumentLabels,
  isBillOfLadingSaved,
  parseRequiredSentDocuments,
} from "../utils/export-sent-documents.js";

const userRepo = new UserRepository();
const notificationRepo = new NotificationRepository();

export async function syncExportSentDocumentNotifications(
  shipment: ExportBulkingShipmentRow,
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await notificationRepo.deleteExportSentDocNotifications(client, shipment.id);

    const required = parseRequiredSentDocuments(shipment.required_sent_documents);
    if (!isBillOfLadingSaved(shipment) || required.length === 0) {
      await client.query("COMMIT");
      return;
    }

    const missingLabels = getMissingRequiredSentDocumentLabels(shipment);
    if (missingLabels.length === 0) {
      await client.query("COMMIT");
      return;
    }

    const users = await userRepo.listActiveUsers();
    const recipients = users.filter((u) =>
      userHasPermission(u.role, u.permission_overrides, PERMISSIONS.VIEW_EXPORT_DOCUMENTATION),
    );

    const message = `Export ${shipment.shipment_no}: sent date missing for ${missingLabels.join(", ")}`;
    await notificationRepo.insertExportSentDocNotifications(
      client,
      recipients.map((u) => ({
        userId: u.id,
        exportBulkingShipmentId: shipment.id,
        message,
      })),
    );

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
