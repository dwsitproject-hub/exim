-- Export bulking invoice workflow: draft/final, snapshots, audit events

ALTER TABLE export_bulking_invoices
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS final_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS revision_no INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_draft_saved_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS export_bulking_invoice_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES export_bulking_invoices (id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  from_status VARCHAR(50),
  to_status VARCHAR(50),
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT,
  changed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebs_inv_events_invoice_id
  ON export_bulking_invoice_events (invoice_id, changed_at DESC);
