-- Export Bulking: Pre-shipment billing / levy fields.
-- Biaya Keluar Amount and Levy Amount are computed at runtime (not stored).

ALTER TABLE export_bulking_shipments
  ADD COLUMN IF NOT EXISTS hs_code                    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS currency_tax               NUMERIC(18, 6),
  ADD COLUMN IF NOT EXISTS biaya_keluar_price_usd_mt  NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS biaya_keluar_billing_no    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS levy_price_usd_mt          NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS levy_billing_no            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS billing_to_gl              TIMESTAMPTZ;
