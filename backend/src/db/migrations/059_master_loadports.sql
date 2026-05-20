-- Master load ports table + drop unused loadport_code from export_bulking_shipments.

CREATE TABLE IF NOT EXISTS master_loadports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ml_name_active
  ON master_loadports (LOWER(TRIM(name)))
  WHERE deleted_at IS NULL;

ALTER TABLE export_bulking_shipments
  DROP COLUMN IF EXISTS loadport_code;
