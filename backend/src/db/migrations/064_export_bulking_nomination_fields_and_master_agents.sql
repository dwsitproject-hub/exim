-- Export bulking: laycan date range, est cargo readiness period, surveyor reason, agent.
-- Master agents (data source for Agent combobox in Commercial Terms).

CREATE TABLE IF NOT EXISTS master_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ma_name_active
  ON master_agents (LOWER(TRIM(name)))
  WHERE deleted_at IS NULL;

ALTER TABLE export_bulking_shipments
  ADD COLUMN IF NOT EXISTS laycan_from DATE,
  ADD COLUMN IF NOT EXISTS laycan_to DATE,
  ADD COLUMN IF NOT EXISTS est_cargo_readiness_period VARCHAR(2),
  ADD COLUMN IF NOT EXISTS surveyor_reason TEXT,
  ADD COLUMN IF NOT EXISTS agent VARCHAR(255);

-- Backfill laycan range from legacy VARCHAR when possible (YYYY-MM-DD … YYYY-MM-DD).
UPDATE export_bulking_shipments
SET
  laycan_from = CASE
    WHEN laycan_from IS NULL AND laycan ~ '^\d{4}-\d{2}-\d{2}'
      THEN (regexp_match(laycan, '(\d{4}-\d{2}-\d{2})'))[1]::date
    ELSE laycan_from
  END,
  laycan_to = CASE
    WHEN laycan_to IS NULL AND laycan ~ '\d{4}-\d{2}-\d{2}.+\d{4}-\d{2}-\d{2}'
      THEN (regexp_match(laycan, '\d{4}-\d{2}-\d{2}.+(\d{4}-\d{2}-\d{2})'))[1]::date
    WHEN laycan_to IS NULL AND laycan ~ '^\d{4}-\d{2}-\d{2}' AND laycan_from IS NULL
      THEN (regexp_match(laycan, '(\d{4}-\d{2}-\d{2})'))[1]::date
    ELSE laycan_to
  END
WHERE laycan IS NOT NULL AND TRIM(laycan) <> '';

-- Store est cargo readiness as date-only going forward.
ALTER TABLE export_bulking_shipments
  ALTER COLUMN est_cargo_readiness TYPE DATE USING est_cargo_readiness::date;
