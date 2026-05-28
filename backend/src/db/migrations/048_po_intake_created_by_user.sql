-- Who created the PO (manual test-create, CSV import). NULL = automated ingestion (e.g. SaaS polling).

ALTER TABLE import_purchase_order
  ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(255) NULL;

COMMENT ON COLUMN import_purchase_order.created_by_user_id IS 'users.id when PO was created by a logged-in user; NULL for automated ingestion';

CREATE INDEX IF NOT EXISTS idx_import_purchase_order_created_by_user_id
  ON import_purchase_order (created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;
