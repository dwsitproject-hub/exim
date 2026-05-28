ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS ppjk_mkl TEXT;

COMMENT ON COLUMN shipments.ppjk_mkl IS 'PPJK/EMKL reference';
