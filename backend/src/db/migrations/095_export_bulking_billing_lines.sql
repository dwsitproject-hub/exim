-- Export Bulking: Billing & Levy rows keyed by sales order (SO) per shipment.
-- currency_tax and billing_to_gl remain on export_bulking_shipments (one per shipment).

CREATE TABLE IF NOT EXISTS export_bulking_billing_lines (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id                 UUID NOT NULL REFERENCES export_bulking_shipments(id) ON DELETE CASCADE,
  so_no                       VARCHAR(100) NOT NULL,
  line_order                  INTEGER NOT NULL DEFAULT 1,
  biaya_keluar_price_usd_mt   NUMERIC(18, 4),
  biaya_keluar_amount_idr     BIGINT,
  biaya_keluar_billing_no     VARCHAR(100),
  levy_price_usd_mt           NUMERIC(18, 4),
  levy_amount_idr             BIGINT,
  levy_billing_no             VARCHAR(100),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT export_bulking_billing_lines_so_unique UNIQUE (shipment_id, so_no)
);

CREATE INDEX IF NOT EXISTS idx_export_bulking_billing_lines_shipment
  ON export_bulking_billing_lines (shipment_id, line_order);

-- Migrate legacy shipment-level biaya/levy to the first invoice SO (when available).
INSERT INTO export_bulking_billing_lines (
  shipment_id, so_no, line_order,
  biaya_keluar_price_usd_mt, biaya_keluar_amount_idr, biaya_keluar_billing_no,
  levy_price_usd_mt, levy_amount_idr, levy_billing_no
)
SELECT
  s.id,
  COALESCE(
    (
      SELECT DISTINCT btrim(il.so_no)
      FROM export_bulking_invoice_lines il
      JOIN export_bulking_invoices inv ON inv.id = il.invoice_id
      WHERE inv.shipment_id = s.id
        AND btrim(COALESCE(il.so_no, '')) <> ''
      ORDER BY btrim(il.so_no)
      LIMIT 1
    ),
    'MIGRATED'
  ),
  1,
  s.biaya_keluar_price_usd_mt,
  s.biaya_keluar_amount_idr,
  s.biaya_keluar_billing_no,
  s.levy_price_usd_mt,
  s.levy_amount_idr,
  s.levy_billing_no
FROM export_bulking_shipments s
WHERE s.deleted_at IS NULL
  AND (
    s.biaya_keluar_price_usd_mt IS NOT NULL
    OR s.biaya_keluar_amount_idr IS NOT NULL
    OR btrim(COALESCE(s.biaya_keluar_billing_no, '')) <> ''
    OR s.levy_price_usd_mt IS NOT NULL
    OR s.levy_amount_idr IS NOT NULL
    OR btrim(COALESCE(s.levy_billing_no, '')) <> ''
  )
ON CONFLICT (shipment_id, so_no) DO NOTHING;
