/**
 * Aggregates shipment-related events for the activity log (status, notes, PO link/unlink, creation).
 */

import { AppError } from "../../../middlewares/errorHandler.js";
import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { ShipmentStatusHistoryRepository } from "../repositories/shipment-status-history.repository.js";
import { ShipmentNoteRepository } from "../repositories/shipment-note.repository.js";
import { ShipmentPoMappingRepository } from "../repositories/shipment-po-mapping.repository.js";
import { ShipmentUpdateLogRepository } from "../repositories/shipment-update-log.repository.js";
import type { ShipmentActivityItem } from "../dto/index.js";

const SHIPMENT_UPDATE_FIELD_LABELS: Record<string, string> = {
  etd: "ETD",
  eta: "ETA",
  atd: "ATD",
  ata: "ATA",
  depo: "Depo",
  depo_location: "Depo location",
  remarks: "Remarks",
  pib_type: "PIB type",
  no_request_pib: "PIB doc no.",
  ppjk_mkl: "PPJK/EMKL",
  product_classification: "Product classification",
  nopen: "NOPEN",
  nopen_date: "NOPEN date",
  ship_by: "Ship by",
  bl_awb: "BL / AWB",
  insurance_no: "Insurance no.",
  coo: "COO",
  incoterm_amount: "Incoterm amount",
  incoterm_currency: "Freight charges currency",
  cbm: "CBM",
  origin_port_name: "Origin port",
  origin_port_country: "Origin country",
  forwarder_name: "Forwarder",
  shipment_method: "Shipment method",
  destination_port_name: "Destination port",
  destination_port_country: "Destination country",
  vendor_name: "Supplier",
  warehouse_name: "Warehouse",
  incoterm: "Incoterm",
  closed_at: "Delivered at",
  close_reason: "Close remark",
  kawasan_berikat: "Kawasan berikat",
  surveyor: "Surveyor",
  unit_20ft: "20′ container",
  unit_40ft: "40′ container",
  unit_package: "Package",
  unit_20_iso_tank: "20′ ISO tank",
  container_count_20ft: "20′ count",
  container_count_40ft: "40′ count",
  package_count: "Package count",
  container_count_20_iso_tank: "20′ ISO tank count",
};

function formatShipmentUpdateFields(keys: string[]): string {
  if (keys.length === 0) return "Shipment details";
  return keys.map((k) => SHIPMENT_UPDATE_FIELD_LABELS[k] ?? k).join(", ");
}

function getShipmentUpdateFieldLabel(key: string): string {
  return SHIPMENT_UPDATE_FIELD_LABELS[key] ?? key;
}

function formatFieldChangesAsDetail(
  changes: Array<{ label: string; before: string | null; after: string | null }>
): string {
  if (changes.length === 0) return "Shipment details";
  return changes.map((c) => `${c.label}: ${c.before ?? "—"} -> ${c.after ?? "—"}`).join("\n");
}

function humanizeStatus(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

type InternalEvent = Omit<ShipmentActivityItem, "occurred_at"> & { at: Date };

export class ShipmentActivityService {
  constructor(
    private readonly shipmentRepo: ShipmentRepository,
    private readonly historyRepo: ShipmentStatusHistoryRepository,
    private readonly noteRepo: ShipmentNoteRepository,
    private readonly mappingRepo: ShipmentPoMappingRepository,
    private readonly updateLogRepo: ShipmentUpdateLogRepository
  ) {}

  async getActivityLog(shipmentId: string): Promise<{ items: ShipmentActivityItem[] }> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);

    const events: InternalEvent[] = [];

    events.push({
      id: `created-${shipment.id}`,
      type: "shipment_created",
      title: "Shipment created",
      detail: `Number ${shipment.shipment_no}`,
      actor: "System",
      at: shipment.created_at,
    });

    const history = await this.historyRepo.findByShipmentId(shipmentId);
    for (const row of history) {
      const from = row.previous_status ? humanizeStatus(row.previous_status) : "—";
      const to = humanizeStatus(row.new_status);
      events.push({
        id: `status-${row.id}`,
        type: "status_change",
        title: `Status: ${from} → ${to}`,
        detail: row.remarks?.trim() || null,
        actor: row.changed_by,
        at: row.changed_at,
      });
    }

    const notes = await this.noteRepo.listByShipmentId(shipmentId);
    for (const n of notes) {
      events.push({
        id: `note-${n.id}`,
        type: "note",
        title: "Note added",
        detail: n.note,
        actor: n.created_by_name,
        at: n.created_at,
      });
    }

    const mappings = await this.mappingRepo.findAllMappingsWithPoByShipmentId(shipmentId);
    for (const m of mappings) {
      events.push({
        id: `couple-${m.mapping_id}`,
        type: "couple_po",
        title: `Linked PO ${m.po_number}`,
        detail: null,
        actor: m.coupled_by,
        at: m.coupled_at,
      });
      if (m.decoupled_at) {
        const reason = m.decouple_reason?.trim();
        events.push({
          id: `decouple-${m.mapping_id}`,
          type: "decouple_po",
          title: `Removed PO ${m.po_number}`,
          detail: reason || null,
          actor: m.decoupled_by ?? "—",
          at: m.decoupled_at,
        });
      }
    }

    const updateLogs = await this.updateLogRepo.findByShipmentId(shipmentId);
    for (const u of updateLogs) {
      const changes = (u.field_changes ?? []).map((c) => ({
        field: c.field,
        label: getShipmentUpdateFieldLabel(c.field),
        before: c.before,
        after: c.after,
      }));
      events.push({
        id: `shipment-update-${u.id}`,
        type: "shipment_updated",
        title: "Shipment details updated",
        detail: changes.length > 0 ? formatFieldChangesAsDetail(changes) : formatShipmentUpdateFields(u.fields_changed),
        field_changes: changes.length > 0 ? changes : undefined,
        actor: u.changed_by,
        at: u.changed_at,
      });
    }

    events.sort((a, b) => b.at.getTime() - a.at.getTime());

    const items: ShipmentActivityItem[] = events.map((e) => ({
      id: e.id,
      type: e.type,
      title: e.title,
      detail: e.detail,
      actor: e.actor,
      occurred_at: e.at.toISOString(),
    }));

    return { items };
  }
}

