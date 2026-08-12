-- Export Bulking: persist computed Biaya Keluar and Levy amounts (IDR).

ALTER TABLE export_bulking_shipments
  ADD COLUMN IF NOT EXISTS biaya_keluar_amount_idr  NUMERIC(18, 0),
  ADD COLUMN IF NOT EXISTS levy_amount_idr          NUMERIC(18, 0);
