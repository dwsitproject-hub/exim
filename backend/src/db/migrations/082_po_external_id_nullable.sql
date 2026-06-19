-- System-created POs (manual form, CSV) do not require an external SaaS id.
ALTER TABLE import_purchase_order
  ALTER COLUMN external_id DROP NOT NULL;

COMMENT ON COLUMN import_purchase_order.external_id IS
  'External system id from SaaS ingestion; NULL for POs created manually in EOS.';
