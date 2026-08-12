-- Add total_quantity to export_bulking_shipments (entered at creation, should match sum of cargo lines).
ALTER TABLE export_bulking_shipments
  ADD COLUMN IF NOT EXISTS total_quantity NUMERIC(18, 4);
