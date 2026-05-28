-- Freight charges (shipment.incoterm_amount) and forwarder bid amounts support USD / IDR.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS incoterm_currency VARCHAR(3) NOT NULL DEFAULT 'IDR';

ALTER TABLE shipments
  DROP CONSTRAINT IF EXISTS chk_shipments_incoterm_currency;

ALTER TABLE shipments
  ADD CONSTRAINT chk_shipments_incoterm_currency CHECK (incoterm_currency IN ('USD', 'IDR'));

COMMENT ON COLUMN shipments.incoterm_currency IS 'Currency for freight charges (incoterm_amount): USD or IDR';

ALTER TABLE shipment_bids
  ADD COLUMN IF NOT EXISTS service_amount_currency VARCHAR(3) NOT NULL DEFAULT 'IDR';

ALTER TABLE shipment_bids
  DROP CONSTRAINT IF EXISTS chk_shipment_bids_service_amount_currency;

ALTER TABLE shipment_bids
  ADD CONSTRAINT chk_shipment_bids_service_amount_currency CHECK (service_amount_currency IN ('USD', 'IDR'));

COMMENT ON COLUMN shipment_bids.service_amount_currency IS 'Currency for service_amount: USD or IDR';
