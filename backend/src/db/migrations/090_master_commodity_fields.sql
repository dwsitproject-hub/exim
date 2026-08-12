-- Master commodities: short name, full name, and type (Liquid / Solid).

ALTER TABLE master_commodities
  ADD COLUMN IF NOT EXISTS short_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS commodity_type VARCHAR(10) NOT NULL DEFAULT 'Solid';

UPDATE master_commodities
SET short_name = TRIM(name)
WHERE short_name IS NULL OR TRIM(short_name) = '';

ALTER TABLE master_commodities
  ALTER COLUMN short_name SET NOT NULL;

ALTER TABLE master_commodities
  DROP CONSTRAINT IF EXISTS master_commodities_commodity_type_check;

ALTER TABLE master_commodities
  ADD CONSTRAINT master_commodities_commodity_type_check
  CHECK (commodity_type IN ('Liquid', 'Solid'));

DROP INDEX IF EXISTS idx_mc_short_name_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_short_name_active
  ON master_commodities (LOWER(TRIM(short_name)))
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN master_commodities.short_name IS 'Short label used in cargo lines and documents';
COMMENT ON COLUMN master_commodities.name IS 'Full commodity name';
COMMENT ON COLUMN master_commodities.commodity_type IS 'Liquid or Solid';
