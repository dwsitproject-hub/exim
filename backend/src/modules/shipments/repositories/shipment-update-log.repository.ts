/**
 * Persists which fields were changed on shipment update (PUT) for the activity log.
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";

export interface ShipmentUpdateLogRow {
  id: string;
  shipment_id: string | null;
  export_bulking_shipment_id: string | null;
  changed_by: string;
  changed_at: Date;
  fields_changed: string[];
  field_changes: ShipmentUpdateFieldChange[];
}

export interface ShipmentUpdateFieldChange {
  field: string;
  before: string | null;
  after: string | null;
}

export interface CreateShipmentUpdateLogInput {
  shipmentId?: string;
  exportBulkingShipmentId?: string;
  changedBy: string;
  fieldsChanged: string[];
  fieldChanges?: ShipmentUpdateFieldChange[];
}

function parseFieldsChanged(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v) as unknown;
      return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseFieldChanges(v: unknown): ShipmentUpdateFieldChange[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const field = typeof e.field === "string" ? e.field : null;
      if (!field) return null;
      const before = e.before == null ? null : String(e.before);
      const after = e.after == null ? null : String(e.after);
      return { field, before, after };
    })
    .filter((x): x is ShipmentUpdateFieldChange => !!x);
}

export class ShipmentUpdateLogRepository {
  private get pool(): Pool {
    return getPool();
  }

  async create(input: CreateShipmentUpdateLogInput): Promise<ShipmentUpdateLogRow> {
    const hasImport = !!input.shipmentId?.trim();
    const hasBulking = !!input.exportBulkingShipmentId?.trim();
    if (hasImport === hasBulking) {
      throw new Error(
        "ShipmentUpdateLogRepository.create: provide exactly one of shipmentId or exportBulkingShipmentId",
      );
    }
    const result = await this.pool.query<{
      id: string;
      shipment_id: string | null;
      export_bulking_shipment_id: string | null;
      changed_by: string;
      changed_at: Date;
      fields_changed: unknown;
      field_changes: unknown;
    }>(
      `INSERT INTO shipment_update_log (shipment_id, export_bulking_shipment_id, changed_by, fields_changed, field_changes)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
       RETURNING id, shipment_id, export_bulking_shipment_id, changed_by, changed_at, fields_changed, field_changes`,
      [
        input.shipmentId ?? null,
        input.exportBulkingShipmentId ?? null,
        input.changedBy,
        JSON.stringify(input.fieldsChanged),
        JSON.stringify(input.fieldChanges ?? []),
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error("ShipmentUpdateLogRepository.create: no row returned");
    return {
      ...row,
      fields_changed: parseFieldsChanged(row.fields_changed),
      field_changes: parseFieldChanges(row.field_changes),
    };
  }

  async findByShipmentId(shipmentId: string): Promise<ShipmentUpdateLogRow[]> {
    const result = await this.pool.query<{
      id: string;
      shipment_id: string | null;
      export_bulking_shipment_id: string | null;
      changed_by: string;
      changed_at: Date;
      fields_changed: unknown;
      field_changes: unknown;
    }>(
      `SELECT id, shipment_id, export_bulking_shipment_id, changed_by, changed_at, fields_changed, field_changes
       FROM shipment_update_log
       WHERE shipment_id = $1
       ORDER BY changed_at ASC`,
      [shipmentId]
    );
    return result.rows.map((r) => ({
      ...r,
      fields_changed: parseFieldsChanged(r.fields_changed),
      field_changes: parseFieldChanges(r.field_changes),
    }));
  }

  async findByExportBulkingShipmentId(exportBulkingShipmentId: string): Promise<ShipmentUpdateLogRow[]> {
    const result = await this.pool.query<{
      id: string;
      shipment_id: string | null;
      export_bulking_shipment_id: string | null;
      changed_by: string;
      changed_at: Date;
      fields_changed: unknown;
      field_changes: unknown;
    }>(
      `SELECT id, shipment_id, export_bulking_shipment_id, changed_by, changed_at, fields_changed, field_changes
       FROM shipment_update_log
       WHERE export_bulking_shipment_id = $1
       ORDER BY changed_at ASC`,
      [exportBulkingShipmentId]
    );
    return result.rows.map((r) => ({
      ...r,
      fields_changed: parseFieldsChanged(r.fields_changed),
      field_changes: parseFieldChanges(r.field_changes),
    }));
  }
}
