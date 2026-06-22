-- Soft delete delivery qty rows when a PO is decoupled or a shipment is removed.
-- Keeps audit history while allowing PO line edits after shipment removal.

ALTER TABLE shipment_po_line_received
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(255);

ALTER TABLE shipment_po_line_received
  DROP CONSTRAINT IF EXISTS shipment_po_line_received_shipment_id_intake_id_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_shipment_po_line_received_active
  ON shipment_po_line_received (shipment_id, intake_id, item_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shipment_po_line_received_deleted_at
  ON shipment_po_line_received (deleted_at)
  WHERE deleted_at IS NULL;

-- Existing orphaned rows (decoupled mapping or soft-deleted shipment) should not block PO edits.
UPDATE shipment_po_line_received r
SET
  deleted_at = COALESCE(m.decoupled_at, s.deleted_at, NOW()),
  deleted_by = COALESCE(m.decoupled_by, s.deleted_by, 'migration:083')
FROM shipment_po_mapping m
JOIN shipments s ON s.id = m.shipment_id
WHERE r.shipment_id = m.shipment_id
  AND r.intake_id = m.intake_id
  AND r.deleted_at IS NULL
  AND (m.decoupled_at IS NOT NULL OR s.deleted_at IS NOT NULL);
