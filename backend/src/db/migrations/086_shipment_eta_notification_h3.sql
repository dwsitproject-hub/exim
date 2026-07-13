-- ETA reminder log: add H-3 (3 days before ETA).

ALTER TABLE shipment_eta_notification_log
  DROP CONSTRAINT IF EXISTS shipment_eta_notification_log_reminder_kind_check;

ALTER TABLE shipment_eta_notification_log
  ADD CONSTRAINT shipment_eta_notification_log_reminder_kind_check
  CHECK (reminder_kind IN ('h1', 'h2', 'h3'));
