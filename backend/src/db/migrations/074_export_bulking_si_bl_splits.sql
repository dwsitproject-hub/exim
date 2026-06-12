-- SI lines: structured B/L splits (count x quantity) and formatted document text.

ALTER TABLE export_bulking_si_lines
  ADD COLUMN IF NOT EXISTS bl_splits JSONB,
  ADD COLUMN IF NOT EXISTS bl_split_text TEXT;
