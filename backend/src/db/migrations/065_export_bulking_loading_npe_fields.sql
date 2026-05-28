-- Export Bulking: loading operations fields and NPE date.
-- Adds: hose_off, bl_figure, ship_figure (Loading stage), npe_date (NPE stage).
-- diff and diff_percentage are derived columns (ship_figure - bl_figure) and are computed at runtime.

ALTER TABLE export_bulking_shipments
  ADD COLUMN IF NOT EXISTS hose_off       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bl_figure      NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS ship_figure    NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS npe_date       TIMESTAMPTZ;
