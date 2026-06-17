-- Export Bulking: configurable required sent documents + export notifications link.

ALTER TABLE export_bulking_shipments
  ADD COLUMN IF NOT EXISTS required_sent_documents JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS export_bulking_shipment_id UUID
    REFERENCES export_bulking_shipments (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_export_bulking
  ON notifications (export_bulking_shipment_id)
  WHERE export_bulking_shipment_id IS NOT NULL;
