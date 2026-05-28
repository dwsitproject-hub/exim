-- Per-shipment PPN / PPH rates (%). NULL = use system defaults from env (PPN_PERCENTAGE, PPH_PERCENTAGE).

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS ppn_percentage NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS pph_percentage NUMERIC(5, 2);

COMMENT ON COLUMN shipments.ppn_percentage IS 'PPN % of (Total Invoice amount + BM); NULL uses PPN_PERCENTAGE env default';
COMMENT ON COLUMN shipments.pph_percentage IS 'PPH % of (Total Invoice amount + BM); NULL uses PPH_PERCENTAGE env default';
