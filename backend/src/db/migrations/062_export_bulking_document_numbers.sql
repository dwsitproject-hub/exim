-- Export Bulking: atomic document number sequences + holder for regenerate permission

CREATE TABLE IF NOT EXISTS export_bulking_doc_number_counters (
  series_code VARCHAR(32) NOT NULL,
  year INT NOT NULL CHECK (year >= 2000 AND year <= 9999),
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  last_serial INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_eb_doc_counters PRIMARY KEY (series_code, year, month)
);

CREATE INDEX IF NOT EXISTS idx_eb_doc_counters_lookup
  ON export_bulking_doc_number_counters (series_code, year DESC, month DESC);

ALTER TABLE export_bulking_shipping_instructions
  ADD COLUMN IF NOT EXISTS doc_number_held_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE export_bulking_invoices
  ADD COLUMN IF NOT EXISTS doc_number_held_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE export_bulking_packing_lists
  ADD COLUMN IF NOT EXISTS doc_number_held_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ebs_si_number_unique
  ON export_bulking_shipping_instructions (si_number)
  WHERE si_number IS NOT NULL AND btrim(si_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ebs_invoice_no_unique
  ON export_bulking_invoices (invoice_no)
  WHERE invoice_no IS NOT NULL AND btrim(invoice_no) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ebs_packing_list_number_unique
  ON export_bulking_packing_lists (packing_list_number)
  WHERE packing_list_number IS NOT NULL AND btrim(packing_list_number) <> '';
