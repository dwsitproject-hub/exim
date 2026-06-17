-- Link packing lists to shipping instructions (one PL per SI).

ALTER TABLE export_bulking_packing_lists
  ADD COLUMN IF NOT EXISTS shipping_instruction_id UUID REFERENCES export_bulking_shipping_instructions (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ebs_pl_shipping_instruction_id
  ON export_bulking_packing_lists (shipping_instruction_id);
