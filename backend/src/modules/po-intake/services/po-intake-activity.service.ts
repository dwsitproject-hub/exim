/**
 * Aggregates PO-related events for the activity log (create, claim, shipment link/unlink, PATCH audit).
 */

import { AppError } from "../../../middlewares/errorHandler.js";
import { PoIntakeRepository } from "../repositories/po-intake.repository.js";
import { PoIntakeUpdateLogRepository } from "../repositories/po-intake-update-log.repository.js";
import { ShipmentPoMappingRepository } from "../../shipments/repositories/shipment-po-mapping.repository.js";
import type { UserRepository } from "../../auth/repositories/user.repository.js";
import type { PoIntakeActivityItem } from "../dto/index.js";

type InternalEvent = Omit<PoIntakeActivityItem, "occurred_at"> & { at: Date };

function formatFieldChangesAsDetail(
  changes: Array<{ label: string; before: string | null; after: string | null }>
): string {
  if (changes.length === 0) return "Purchase Order updated";
  return changes.map((c) => `${c.label}: ${c.before ?? "—"} → ${c.after ?? "—"}`).join("\n");
}

export class PoIntakeActivityService {
  constructor(
    private readonly poRepo: PoIntakeRepository,
    private readonly mappingRepo: ShipmentPoMappingRepository,
    private readonly updateLogRepo: PoIntakeUpdateLogRepository,
    private readonly userRepo: UserRepository
  ) {}

  async getActivityLog(intakeId: string): Promise<{ items: PoIntakeActivityItem[] }> {
    const po = await this.poRepo.findById(intakeId);
    if (!po) throw new AppError("PO intake not found", 404);

    const events: InternalEvent[] = [];

    let createActor = "System";
    if (po.created_by_user_id) {
      const creator = await this.userRepo.findById(po.created_by_user_id);
      createActor =
        creator?.name?.trim() || creator?.email?.trim() || po.created_by_user_id;
    }

    events.push({
      id: `created-${po.id}`,
      type: "po_created",
      title: "Purchase Order recorded",
      detail: `PO ${po.po_number}`,
      actor: createActor,
      at: po.created_at,
    });

    if (po.taken_at) {
      let claimActor = "—";
      if (po.taken_by_user_id) {
        const u = await this.userRepo.findById(po.taken_by_user_id);
        claimActor = u?.name?.trim() || u?.email?.trim() || po.taken_by_user_id;
      }
      events.push({
        id: `claimed-${po.id}`,
        type: "po_claimed",
        title: "PO claimed",
        detail: null,
        actor: claimActor,
        at: po.taken_at,
      });
    }

    const mappings = await this.mappingRepo.findAllMappingsWithShipmentByIntakeId(intakeId);
    for (const m of mappings) {
      events.push({
        id: `couple-${m.mapping_id}`,
        type: "couple_shipment",
        title: `Linked to shipment ${m.shipment_no}`,
        detail: null,
        actor: m.coupled_by,
        at: m.coupled_at,
      });
      if (m.decoupled_at) {
        const reason = m.decouple_reason?.trim();
        events.push({
          id: `decouple-${m.mapping_id}`,
          type: "decouple_shipment",
          title: `Removed from shipment ${m.shipment_no}`,
          detail: reason || null,
          actor: m.decoupled_by ?? "—",
          at: m.decoupled_at,
        });
      }
    }

    const updateLogs = await this.updateLogRepo.findByIntakeId(intakeId);
    for (const u of updateLogs) {
      const changes = u.field_changes.map((c) => ({
        field: c.field,
        label: c.label,
        before: c.before,
        after: c.after,
      }));
      events.push({
        id: `po-update-${u.id}`,
        type: "po_updated",
        title: "Purchase Order updated",
        detail: formatFieldChangesAsDetail(changes),
        field_changes: changes.length > 0 ? changes : undefined,
        actor: u.changed_by,
        at: u.changed_at,
      });
    }

    events.sort((a, b) => b.at.getTime() - a.at.getTime());

    const items: PoIntakeActivityItem[] = events.map((e) => ({
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
