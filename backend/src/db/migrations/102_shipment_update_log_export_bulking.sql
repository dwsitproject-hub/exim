-- Reuse shipment_update_log for export bulking PATCH audit (no new table).

ALTER TABLE shipment_update_log
  ALTER COLUMN shipment_id DROP NOT NULL;

ALTER TABLE shipment_update_log
  ADD COLUMN IF NOT EXISTS export_bulking_shipment_id UUID
    REFERENCES export_bulking_shipments (id) ON DELETE CASCADE;

ALTER TABLE shipment_update_log
  DROP CONSTRAINT IF EXISTS shipment_update_log_one_parent;

ALTER TABLE shipment_update_log
  ADD CONSTRAINT shipment_update_log_one_parent CHECK (
    (shipment_id IS NOT NULL AND export_bulking_shipment_id IS NULL)
    OR (shipment_id IS NULL AND export_bulking_shipment_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_shipment_update_log_eb_shipment_changed
  ON shipment_update_log (export_bulking_shipment_id, changed_at DESC)
  WHERE export_bulking_shipment_id IS NOT NULL;
