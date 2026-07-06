-- Master surveyors (data source for Surveyor combobox in export bulking Commercial Terms).

CREATE TABLE IF NOT EXISTS master_surveyors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ms_name_active
  ON master_surveyors (LOWER(TRIM(name)))
  WHERE deleted_at IS NULL;
