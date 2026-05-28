-- Export Bulking: add NOR (Notice of Readiness) datetime field.
-- NOR is issued when the vessel arrives and notifies the port it is ready to berth.
-- Used as an input to the conditional Laytime Start calculation.

ALTER TABLE export_bulking_shipments
  ADD COLUMN IF NOT EXISTS nor TIMESTAMPTZ;
