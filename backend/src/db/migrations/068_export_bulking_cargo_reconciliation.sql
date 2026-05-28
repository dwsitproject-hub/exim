-- Export Bulking: per-cargo quantity reconciliation fields (Loading stage).
-- Diff and Diff % are computed at runtime (ship_figure - bl_figure).

ALTER TABLE export_bulking_cargo_lines
  ADD COLUMN IF NOT EXISTS quantity_delivered NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS bl_figure          NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS ship_figure        NUMERIC(18, 4);
