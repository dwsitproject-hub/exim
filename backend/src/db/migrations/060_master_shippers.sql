-- Master shippers + shipper load ports (replaces master_loadports from 059).

DROP TABLE IF EXISTS master_loadports;

CREATE TABLE IF NOT EXISTS master_shippers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ms_name_active
  ON master_shippers (LOWER(TRIM(name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS shipper_loadports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipper_id UUID NOT NULL REFERENCES master_shippers(id),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slp_shipper_name_active
  ON shipper_loadports (shipper_id, LOWER(TRIM(name)))
  WHERE deleted_at IS NULL;
