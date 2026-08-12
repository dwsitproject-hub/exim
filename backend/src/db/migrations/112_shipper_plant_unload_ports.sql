-- Unload ports under import plants, optionally linked to Jetty (JPS) port ids.

CREATE TABLE IF NOT EXISTS shipper_plant_unload_ports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id UUID NOT NULL REFERENCES shipper_plants(id),
  name VARCHAR(255) NOT NULL,
  jps_port_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spup_plant_name_active
  ON shipper_plant_unload_ports (plant_id, LOWER(TRIM(name)))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_spup_jps_port
  ON shipper_plant_unload_ports (jps_port_id)
  WHERE deleted_at IS NULL AND jps_port_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_spup_plant_active
  ON shipper_plant_unload_ports (plant_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE shipper_plant_unload_ports IS
  'Unload / discharge ports per import plant; optional JPS port_id for Jetty SI.';
COMMENT ON COLUMN shipper_plant_unload_ports.jps_port_id IS
  'Optional JPS port id (partner GET /ports). When set, used for import Jetty SI port_id.';
