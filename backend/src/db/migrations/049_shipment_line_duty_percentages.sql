-- BM%, PPN%, PPH% per shipment PO line (user-entered). Shipment-level % columns removed; amounts still derived in app.

ALTER TABLE shipment_po_line_received
  ADD COLUMN IF NOT EXISTS bm_percentage NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS ppn_percentage NUMERIC(8, 4),
  ADD COLUMN IF NOT EXISTS pph_percentage NUMERIC(8, 4);

UPDATE shipment_po_line_received r
SET
  bm_percentage = COALESCE(r.bm_percentage, s.bm_percentage),
  ppn_percentage = COALESCE(r.ppn_percentage, s.ppn_percentage),
  pph_percentage = COALESCE(r.pph_percentage, s.pph_percentage)
FROM shipments s
WHERE r.shipment_id = s.id;

ALTER TABLE shipments DROP COLUMN IF EXISTS bm_percentage;
ALTER TABLE shipments DROP COLUMN IF EXISTS ppn_percentage;
ALTER TABLE shipments DROP COLUMN IF EXISTS pph_percentage;
