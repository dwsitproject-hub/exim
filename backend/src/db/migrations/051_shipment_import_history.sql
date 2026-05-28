-- CSV import history for shipment combined CSV uploads.

CREATE TABLE IF NOT EXISTS shipment_import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name VARCHAR(255),
  uploaded_by VARCHAR(255) NOT NULL,
  total_rows INT NOT NULL DEFAULT 0,
  imported_shipments INT NOT NULL DEFAULT 0,
  imported_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_shipment_import_history_created_at
  ON shipment_import_history (created_at DESC);
