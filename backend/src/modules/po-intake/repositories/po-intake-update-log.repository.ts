/**
 * Persists PO intake PATCH audit rows for the activity log.
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";

export interface PoIntakeUpdateFieldChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface PoIntakeUpdateLogRow {
  id: string;
  intake_id: string;
  changed_by: string;
  changed_at: Date;
  fields_changed: string[];
  field_changes: PoIntakeUpdateFieldChange[];
}

export interface CreatePoIntakeUpdateLogInput {
  intakeId: string;
  changedBy: string;
  fieldsChanged: string[];
  fieldChanges: PoIntakeUpdateFieldChange[];
}

function parseFieldsChanged(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function parseFieldChanges(v: unknown): PoIntakeUpdateFieldChange[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const field = typeof e.field === "string" ? e.field : null;
      const label = typeof e.label === "string" ? e.label : null;
      if (!field || !label) return null;
      const before = e.before == null ? null : String(e.before);
      const after = e.after == null ? null : String(e.after);
      return { field, label, before, after };
    })
    .filter((x): x is PoIntakeUpdateFieldChange => !!x);
}

export class PoIntakeUpdateLogRepository {
  private get pool(): Pool {
    return getPool();
  }

  async create(input: CreatePoIntakeUpdateLogInput): Promise<PoIntakeUpdateLogRow> {
    const result = await this.pool.query<{
      id: string;
      intake_id: string;
      changed_by: string;
      changed_at: Date;
      fields_changed: unknown;
      field_changes: unknown;
    }>(
      `INSERT INTO po_intake_update_log (intake_id, changed_by, fields_changed, field_changes)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       RETURNING id, intake_id, changed_by, changed_at, fields_changed, field_changes`,
      [
        input.intakeId,
        input.changedBy,
        JSON.stringify(input.fieldsChanged),
        JSON.stringify(input.fieldChanges),
      ]
    );
    const row = result.rows[0];
    if (!row) throw new Error("PoIntakeUpdateLogRepository.create: no row returned");
    return {
      ...row,
      fields_changed: parseFieldsChanged(row.fields_changed),
      field_changes: parseFieldChanges(row.field_changes),
    };
  }

  async findByIntakeId(intakeId: string): Promise<PoIntakeUpdateLogRow[]> {
    const result = await this.pool.query<{
      id: string;
      intake_id: string;
      changed_by: string;
      changed_at: Date;
      fields_changed: unknown;
      field_changes: unknown;
    }>(
      `SELECT id, intake_id, changed_by, changed_at, fields_changed, field_changes
       FROM po_intake_update_log
       WHERE intake_id = $1
       ORDER BY changed_at ASC`,
      [intakeId]
    );
    return result.rows.map((r) => ({
      ...r,
      fields_changed: parseFieldsChanged(r.fields_changed),
      field_changes: parseFieldChanges(r.field_changes),
    }));
  }
}
