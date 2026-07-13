-- Optional per-cargo notes on quantity reconciliation (Loading stage).

ALTER TABLE export_bulking_cargo_lines
  ADD COLUMN IF NOT EXISTS reconciliation_remarks TEXT;

COMMENT ON COLUMN export_bulking_cargo_lines.reconciliation_remarks IS 'Optional loading qty reconciliation notes';
