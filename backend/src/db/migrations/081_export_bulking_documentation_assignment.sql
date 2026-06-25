-- Lead documentation assigns export bulking shipments to documentation officers.

ALTER TABLE export_bulking_shipments
  ADD COLUMN IF NOT EXISTS documentation_assigned_to UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS documentation_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS documentation_assigned_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_ebs_documentation_assigned_to
  ON export_bulking_shipments (documentation_assigned_to)
  WHERE deleted_at IS NULL;
