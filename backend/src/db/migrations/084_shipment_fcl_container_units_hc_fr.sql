-- FCL container types: 40 HC, 20 FR, 40 FR (with optional counts).

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS unit_40_hc BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unit_20_fr BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unit_40_fr BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS container_count_40_hc INTEGER,
  ADD COLUMN IF NOT EXISTS container_count_20_fr INTEGER,
  ADD COLUMN IF NOT EXISTS container_count_40_fr INTEGER;

COMMENT ON COLUMN shipments.unit_40_hc IS 'FCL: 40′ HC container selected';
COMMENT ON COLUMN shipments.unit_20_fr IS 'FCL: 20′ flat rack selected';
COMMENT ON COLUMN shipments.unit_40_fr IS 'FCL: 40′ flat rack selected';
COMMENT ON COLUMN shipments.container_count_40_hc IS 'FCL: number of 40′ HC containers when unit_40_hc is true';
COMMENT ON COLUMN shipments.container_count_20_fr IS 'FCL: number of 20′ flat racks when unit_20_fr is true';
COMMENT ON COLUMN shipments.container_count_40_fr IS 'FCL: number of 40′ flat racks when unit_40_fr is true';
