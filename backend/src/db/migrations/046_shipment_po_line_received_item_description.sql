-- Denormalized PO line text at write time (snapshot beside item_id).

ALTER TABLE shipment_po_line_received
  ADD COLUMN IF NOT EXISTS item_description TEXT;

UPDATE shipment_po_line_received r
SET item_description = NULLIF(TRIM(BOTH FROM COALESCE(it.item_description, '')), '')
FROM import_purchase_order_items it
WHERE it.id = r.item_id;
