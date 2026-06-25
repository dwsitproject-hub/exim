-- Dedup log for import shipment ETA H-2 / H-1 in-app notifications (PIC = linked PO claimer).

CREATE TABLE IF NOT EXISTS shipment_eta_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES shipments (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reminder_kind VARCHAR(8) NOT NULL CHECK (reminder_kind IN ('h1', 'h2')),
  eta_date DATE NOT NULL,
  notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shipment_id, user_id, reminder_kind, eta_date)
);

CREATE INDEX IF NOT EXISTS idx_shipment_eta_notification_log_shipment
  ON shipment_eta_notification_log (shipment_id);

CREATE INDEX IF NOT EXISTS idx_shipment_eta_notification_log_user
  ON shipment_eta_notification_log (user_id, notified_at DESC);
