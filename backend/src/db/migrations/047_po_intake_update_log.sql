-- Audit trail for PATCH /po/:id — shown in Purchase Order activity log.

CREATE TABLE IF NOT EXISTS po_intake_update_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id UUID NOT NULL REFERENCES import_purchase_order (id) ON DELETE CASCADE,
  changed_by VARCHAR(255) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fields_changed JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_changes JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_po_intake_update_log_intake_changed
  ON po_intake_update_log (intake_id, changed_at DESC);
