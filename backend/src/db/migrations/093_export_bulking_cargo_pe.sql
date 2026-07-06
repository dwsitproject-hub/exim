-- PE (Persetujuan Ekspor) per cargo line instead of shipment-level only.

ALTER TABLE export_bulking_cargo_lines
  ADD COLUMN IF NOT EXISTS pe_no   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pe_date TIMESTAMPTZ;

-- Migrate legacy shipment-level PE to each cargo line on that shipment.
UPDATE export_bulking_cargo_lines cl
SET
  pe_no = s.pe_no,
  pe_date = s.pe_date,
  updated_at = NOW()
FROM export_bulking_shipments s
WHERE cl.shipment_id = s.id
  AND s.pe_no IS NOT NULL
  AND cl.pe_no IS NULL;
