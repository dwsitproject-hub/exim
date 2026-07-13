/**
 * Aggregates export bulking shipment events for the activity log (status, field updates, creation).
 */

import { AppError } from "../../../middlewares/errorHandler.js";
import type { UserRepository } from "../../auth/repositories/user.repository.js";
import { ShipmentUpdateLogRepository } from "../../shipments/repositories/shipment-update-log.repository.js";
import type { ExportBulkingRepository } from "../repositories/export-bulking.repository.js";
import { getExportBulkingUpdateFieldLabel } from "../utils/export-bulking-update-fields.js";
import type { ExportBulkingActivityItem } from "../dto/index.js";

function formatExportBulkingStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

function formatFieldChangesAsDetail(
  changes: Array<{ label: string; before: string | null; after: string | null }>,
): string {
  if (changes.length === 0) return "Shipment details";
  return changes.map((c) => `${c.label}: ${c.before ?? "—"} → ${c.after ?? "—"}`).join("\n");
}

type InternalEvent = Omit<ExportBulkingActivityItem, "occurred_at"> & { at: Date };

export class ExportBulkingActivityService {
  constructor(
    private readonly repo: ExportBulkingRepository,
    private readonly updateLogRepo: ShipmentUpdateLogRepository,
    private readonly userRepo: UserRepository,
  ) {}

  private async resolveActor(userId: string | null | undefined): Promise<string> {
    if (!userId?.trim()) return "—";
    const user = await this.userRepo.findById(userId.trim());
    return user?.name?.trim() || user?.email?.trim() || userId.trim();
  }

  async getActivityLog(shipmentId: string): Promise<{ items: ExportBulkingActivityItem[] }> {
    const shipment = await this.repo.getById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);

    const events: InternalEvent[] = [];

    events.push({
      id: `created-${shipment.id}`,
      type: "export_bulking_created",
      title: "Export bulking shipment created",
      detail: `Number ${shipment.shipment_no}`,
      actor: await this.resolveActor(shipment.created_by),
      at: new Date(shipment.created_at),
    });

    const statusRows = (await this.repo.getStatusEvents(shipmentId)) as Array<{
      id: string;
      old_status: string | null;
      new_status: string;
      changed_by: string | null;
      changed_at: Date;
      remarks: string | null;
    }>;

    for (const row of statusRows) {
      const from = row.old_status ? formatExportBulkingStatus(row.old_status) : "—";
      const to = formatExportBulkingStatus(row.new_status);
      events.push({
        id: `status-${row.id}`,
        type: "status_change",
        title: `Status: ${from} → ${to}`,
        detail: row.remarks?.trim() || null,
        actor: await this.resolveActor(row.changed_by),
        at: row.changed_at,
      });
    }

    const updateLogs = await this.updateLogRepo.findByExportBulkingShipmentId(shipmentId);
    for (const u of updateLogs) {
      const changes = (u.field_changes ?? []).map((c) => ({
        field: c.field,
        label: getExportBulkingUpdateFieldLabel(c.field),
        before: c.before,
        after: c.after,
      }));
      const isAssignment = changes.some((c) => c.field === "documentation_assigned_to");
      events.push({
        id: `export-bulking-update-${u.id}`,
        type: isAssignment ? "documentation_assigned" : "shipment_updated",
        title: isAssignment ? "Documentation PIC updated" : "Shipment details updated",
        detail: changes.length > 0 ? formatFieldChangesAsDetail(changes) : "Shipment details",
        field_changes: changes.length > 0 ? changes : undefined,
        actor: u.changed_by,
        at: u.changed_at,
      });
    }

    events.sort((a, b) => b.at.getTime() - a.at.getTime());

    const items: ExportBulkingActivityItem[] = events.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      detail: e.detail,
      field_changes: e.field_changes,
      actor: e.actor,
      occurred_at: e.at.toISOString(),
    }));

    return { items };
  }
}
