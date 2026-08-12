-- Insurance amount (Asuransi/LDN) + PIB draft OCR verification metadata on shipment_documents.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS insurance_amount NUMERIC(18, 4);

COMMENT ON COLUMN shipments.insurance_amount IS 'Insurance amount (Asuransi/LDN) for cross-check against PIB draft OCR';

ALTER TABLE shipment_documents
  ADD COLUMN IF NOT EXISTS ocr_extracted JSONB,
  ADD COLUMN IF NOT EXISTS ocr_warnings JSONB,
  ADD COLUMN IF NOT EXISTS ocr_compared_at TIMESTAMPTZ;

COMMENT ON COLUMN shipment_documents.ocr_extracted IS 'Fields extracted from PIB draft PDF (OCR/text layer)';
COMMENT ON COLUMN shipment_documents.ocr_warnings IS 'Soft mismatch warnings from PIB draft vs shipment data';
COMMENT ON COLUMN shipment_documents.ocr_compared_at IS 'When OCR extract was last compared to shipment data';
