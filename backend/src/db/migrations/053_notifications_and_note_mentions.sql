-- In-app notifications and shipment note @mention tracking.

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type VARCHAR(64) NOT NULL,
  reference_id UUID NOT NULL,
  shipment_id UUID REFERENCES shipments (id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS shipment_note_mentions (
  note_id UUID NOT NULL REFERENCES shipment_notes (id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_shipment_note_mentions_user ON shipment_note_mentions (mentioned_user_id);
