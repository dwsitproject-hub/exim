-- Messrs (forwarding agency) on shipping instruction header for SI document.
ALTER TABLE export_bulking_shipping_instructions
  ADD COLUMN IF NOT EXISTS messrs TEXT;
