-- Link EOS master commodities to Jetty (JPS) commodity short_name from GET /commodities.

ALTER TABLE master_commodities
  ADD COLUMN IF NOT EXISTS jps_short_name VARCHAR(100);

COMMENT ON COLUMN master_commodities.jps_short_name IS
  'Optional JPS commodity short_name (partner GET /commodities). Sent as cargo[].cargo_type on SI.';

CREATE INDEX IF NOT EXISTS idx_master_commodities_jps_short_name
  ON master_commodities (LOWER(TRIM(jps_short_name)))
  WHERE deleted_at IS NULL AND jps_short_name IS NOT NULL;
