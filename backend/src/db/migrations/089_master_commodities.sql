-- Master commodities (data source for Cargo Name / commodity combobox in export bulking).

CREATE TABLE IF NOT EXISTS master_commodities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_name_active
  ON master_commodities (LOWER(TRIM(name)))
  WHERE deleted_at IS NULL;
