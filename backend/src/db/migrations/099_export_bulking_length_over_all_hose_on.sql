-- Export Bulking: nomination LOA and loading hose-on (liquid cargo).

ALTER TABLE export_bulking_shipments
  ADD COLUMN IF NOT EXISTS length_over_all NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS hose_on          TIMESTAMPTZ;

COMMENT ON COLUMN export_bulking_shipments.length_over_all IS 'Length Over All (LOA), metres';
COMMENT ON COLUMN export_bulking_shipments.hose_on IS 'Hose on datetime (liquid cargo loading)';
