-- Link invoices to shipping instructions (1 SI → many invoices).

ALTER TABLE export_bulking_invoices
  ADD COLUMN IF NOT EXISTS shipping_instruction_id UUID REFERENCES export_bulking_shipping_instructions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ebs_inv_shipping_instruction_id
  ON export_bulking_invoices (shipping_instruction_id);
