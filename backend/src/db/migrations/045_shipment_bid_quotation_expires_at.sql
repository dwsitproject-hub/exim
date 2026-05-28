-- Optional calendar date when the forwarder quotation expires (user-set). Replaces duration-based validity in UI.
ALTER TABLE shipment_bids
  ADD COLUMN IF NOT EXISTS quotation_expires_at DATE;
