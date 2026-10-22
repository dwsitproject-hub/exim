-- Per-user PO detail views (clears "new" list indicators after open).

CREATE TABLE IF NOT EXISTS po_intake_user_views (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  intake_id UUID NOT NULL REFERENCES import_purchase_order (id) ON DELETE CASCADE,
  first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, intake_id)
);

CREATE INDEX IF NOT EXISTS idx_po_intake_user_views_intake_id ON po_intake_user_views (intake_id);

COMMENT ON TABLE po_intake_user_views IS
  'First time each user opened PO detail; used to hide new-PO list dot/highlight.';
