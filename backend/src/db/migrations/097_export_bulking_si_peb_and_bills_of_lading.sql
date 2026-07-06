-- PEB fields per shipping instruction; multiple bills of lading per shipment

ALTER TABLE export_bulking_shipping_instructions
  ADD COLUMN IF NOT EXISTS peb_request_no VARCHAR(100),
  ADD COLUMN IF NOT EXISTS peb_no VARCHAR(100),
  ADD COLUMN IF NOT EXISTS peb_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hs_code VARCHAR(50);

CREATE TABLE IF NOT EXISTS export_bulking_bills_of_lading (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES export_bulking_shipments (id) ON DELETE CASCADE,
  line_order INT NOT NULL DEFAULT 1,
  bill_of_lading_no VARCHAR(100),
  bill_of_lading_date TIMESTAMPTZ,
  bill_of_lading_nn_obl VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebs_bol_shipment_id
  ON export_bulking_bills_of_lading (shipment_id);

-- Copy legacy shipment-level PEB to each SI on that shipment
UPDATE export_bulking_shipping_instructions si
SET
  peb_request_no = s.peb_request_no,
  peb_no = s.peb_no,
  peb_date = s.peb_date,
  hs_code = s.hs_code
FROM export_bulking_shipments s
WHERE si.shipment_id = s.id
  AND si.peb_no IS NULL
  AND (s.peb_no IS NOT NULL OR s.peb_request_no IS NOT NULL OR s.peb_date IS NOT NULL OR s.hs_code IS NOT NULL);

-- Copy legacy single B/L into bills_of_lading table
INSERT INTO export_bulking_bills_of_lading (
  shipment_id,
  line_order,
  bill_of_lading_no,
  bill_of_lading_date,
  bill_of_lading_nn_obl
)
SELECT
  s.id,
  1,
  s.bill_of_lading_no,
  s.bill_of_lading_date,
  s.bill_of_lading_nn_obl
FROM export_bulking_shipments s
WHERE s.bill_of_lading_no IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM export_bulking_bills_of_lading b WHERE b.shipment_id = s.id
  );
