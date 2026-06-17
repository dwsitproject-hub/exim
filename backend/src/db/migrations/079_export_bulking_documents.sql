-- Export bulking uploaded documents (files on shared storage under Export/bulking/).

CREATE TABLE IF NOT EXISTS export_bulking_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES export_bulking_shipments (id) ON DELETE CASCADE,
  document_type VARCHAR(40) NOT NULL,
  original_file_name VARCHAR(512) NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  mime_type VARCHAR(200),
  size_bytes BIGINT NOT NULL,
  uploaded_by VARCHAR(255) NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eb_documents_shipment_uploaded
  ON export_bulking_documents (shipment_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_eb_documents_shipment_type
  ON export_bulking_documents (shipment_id, document_type);
