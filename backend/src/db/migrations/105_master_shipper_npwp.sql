-- NPWP per shipper master (used on export Shipping Instruction documents).

ALTER TABLE master_shippers
  ADD COLUMN IF NOT EXISTS npwp VARCHAR(100);

COMMENT ON COLUMN master_shippers.npwp IS 'Tax ID (NPWP) for export shipping instruction documents';
