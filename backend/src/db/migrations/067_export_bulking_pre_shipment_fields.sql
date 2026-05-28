-- Export Bulking: Pre-shipment stage document fields.

ALTER TABLE export_bulking_shipments
  ADD COLUMN IF NOT EXISTS quantity_spb           NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS spb                    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS delivery_order_pgi     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS spr                    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bill_of_lading_no      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bill_of_lading_date    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bill_of_lading_nn_obl  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sent_bl                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_coo               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_phyto             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_hc                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_sr                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_sustainability    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS present_docs           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS peb_request_no        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS peb_no                 VARCHAR(100),
  ADD COLUMN IF NOT EXISTS peb_date               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pe_no                  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pe_date                TIMESTAMPTZ;
