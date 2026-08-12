-- Link import shipment destination to master plant unload port (no free-text discharge port).

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS destination_unload_port_id UUID
    REFERENCES shipper_plant_unload_ports(id);

COMMENT ON COLUMN shipments.destination_unload_port_id IS
  'Master plant unload port (port of discharge). When that port has jps_port_id, Jetty SI uses it.';

CREATE INDEX IF NOT EXISTS idx_shipments_destination_unload_port
  ON shipments (destination_unload_port_id)
  WHERE deleted_at IS NULL AND destination_unload_port_id IS NOT NULL;
