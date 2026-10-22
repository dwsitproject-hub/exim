-- PO line unit codes: seeded defaults + units auto-registered from Syncera ingest.

CREATE TABLE IF NOT EXISTS po_item_unit_codes (
  code VARCHAR(50) PRIMARY KEY,
  source VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT po_item_unit_codes_source_check CHECK (source IN ('seed', 'syncera'))
);

CREATE INDEX IF NOT EXISTS idx_po_item_unit_codes_created_at ON po_item_unit_codes (created_at DESC);

COMMENT ON TABLE po_item_unit_codes IS
  'Allowed PO line unit codes; merged with static seed list at runtime. Syncera poller inserts new codes here.';
