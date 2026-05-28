-- User-entered PPN and PPH totals (IDR); BM remains derived from line BM%; PDRI = BM + PPN + PPH.
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS ppn_amount NUMERIC(20, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pph_amount NUMERIC(20, 4) NOT NULL DEFAULT 0;
