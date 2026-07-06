-- Export Bulking: Data SAP rows keyed by sales order (SO) number per shipment.

CREATE TABLE IF NOT EXISTS export_bulking_sap_lines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id         UUID NOT NULL REFERENCES export_bulking_shipments(id) ON DELETE CASCADE,
  so_no               VARCHAR(100) NOT NULL,
  line_order          INTEGER NOT NULL DEFAULT 1,
  quantity_spb        NUMERIC(18, 4),
  spb                 VARCHAR(100),
  delivery_order_pgi  VARCHAR(100),
  spr                 VARCHAR(100),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT export_bulking_sap_lines_so_unique UNIQUE (shipment_id, so_no)
);

CREATE INDEX IF NOT EXISTS idx_export_bulking_sap_lines_shipment
  ON export_bulking_sap_lines (shipment_id, line_order);

-- Migrate legacy shipment-level SAP fields to the first invoice SO (when available).
INSERT INTO export_bulking_sap_lines (shipment_id, so_no, line_order, quantity_spb, spb, delivery_order_pgi, spr)
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
  s.quantity_spb,
  s.spb,
  s.delivery_order_pgi,
  s.spr
FROM export_bulking_shipments s
WHERE s.deleted_at IS NULL
  AND (
    s.quantity_spb IS NOT NULL
    OR btrim(COALESCE(s.spb, '')) <> ''
    OR btrim(COALESCE(s.delivery_order_pgi, '')) <> ''
    OR btrim(COALESCE(s.spr, '')) <> ''
  )
ON CONFLICT (shipment_id, so_no) DO NOTHING;
