-- Link EOS master shipper load ports to Jetty (JPS) port ids from GET /ports.

ALTER TABLE shipper_loadports
  ADD COLUMN IF NOT EXISTS jps_port_id INTEGER;

COMMENT ON COLUMN shipper_loadports.jps_port_id IS
  'Optional JPS port id (partner GET /ports). When set, this EOS load port can be used for Jetty SI port_id.';

CREATE INDEX IF NOT EXISTS idx_shipper_loadports_jps_port
  ON shipper_loadports (jps_port_id)
  WHERE deleted_at IS NULL AND jps_port_id IS NOT NULL;
