-- Per-shipper document header image for export bulking printable documents (SI, Invoice, Packing List).

ALTER TABLE master_shippers
  ADD COLUMN IF NOT EXISTS document_header_storage_key VARCHAR(512),
  ADD COLUMN IF NOT EXISTS document_header_file_name VARCHAR(512),
  ADD COLUMN IF NOT EXISTS document_header_mime_type VARCHAR(200);

COMMENT ON COLUMN master_shippers.document_header_storage_key IS 'Storage key for uploaded letterhead image used on export document headers';
COMMENT ON COLUMN master_shippers.document_header_file_name IS 'Original filename of uploaded document header image';
COMMENT ON COLUMN master_shippers.document_header_mime_type IS 'MIME type of uploaded document header image';
