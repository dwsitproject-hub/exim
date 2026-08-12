-- Phase A MVP: per-shipment Jetty port + commodity selected from JPS master APIs.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS jps_port_id INTEGER,
  ADD COLUMN IF NOT EXISTS jps_cargo_type VARCHAR(100);

COMMENT ON COLUMN shipments.jps_port_id IS 'JPS port id from GET /ports (sent as port_id on SI)';
COMMENT ON COLUMN shipments.jps_cargo_type IS 'JPS commodity short_name from GET /commodities (sent as cargo[].cargo_type)';
