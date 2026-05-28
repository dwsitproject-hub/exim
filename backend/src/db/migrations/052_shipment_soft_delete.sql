-- Soft delete: hide shipments from operational lists while retaining history.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_shipments_deleted_at ON shipments (deleted_at) WHERE deleted_at IS NULL;
