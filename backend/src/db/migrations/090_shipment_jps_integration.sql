-- Vessel / shipping agent fields for Jetty Planning System (JPS) SI sync + sync bookkeeping.

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS vessel_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS voyage_no VARCHAR(50),
  ADD COLUMN IF NOT EXISTS agent_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS jps_si_id INTEGER,
  ADD COLUMN IF NOT EXISTS jps_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS jps_external_reference VARCHAR(100),
  ADD COLUMN IF NOT EXISTS jps_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS jps_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS jps_sync_dirty BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS jps_last_error TEXT,
  ADD COLUMN IF NOT EXISTS jps_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS jps_jetty_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS jps_planned_berthing_time TIMESTAMPTZ;

COMMENT ON COLUMN shipments.vessel_name IS 'Vessel name for JPS Shipping Instruction';
COMMENT ON COLUMN shipments.voyage_no IS 'Optional voyage number for JPS Shipping Instruction';
COMMENT ON COLUMN shipments.agent_name IS 'Shipping agent name for JPS Shipping Instruction (not forwarder)';
COMMENT ON COLUMN shipments.jps_si_id IS 'JPS shipping instruction id from partner API POST';
COMMENT ON COLUMN shipments.jps_status IS 'Partner status: Pending, Approved, Rejected, Allocated';
COMMENT ON COLUMN shipments.jps_external_reference IS 'external_reference sent to JPS (usually shipment_no)';
COMMENT ON COLUMN shipments.jps_submitted_at IS 'First successful POST to JPS';
COMMENT ON COLUMN shipments.jps_last_synced_at IS 'Last successful POST/PATCH to JPS';
COMMENT ON COLUMN shipments.jps_sync_dirty IS 'Mapped fields changed after submit; awaiting JPS update API';
COMMENT ON COLUMN shipments.jps_last_error IS 'Last JPS sync error (code/message/request_id)';
COMMENT ON COLUMN shipments.jps_rejection_reason IS 'Rejection reason from JPS GET when Rejected';
COMMENT ON COLUMN shipments.jps_jetty_name IS 'Allocated jetty name from JPS';
COMMENT ON COLUMN shipments.jps_planned_berthing_time IS 'Planned berthing time from JPS allocation';

CREATE INDEX IF NOT EXISTS idx_shipments_jps_poll
  ON shipments (jps_si_id)
  WHERE jps_si_id IS NOT NULL AND deleted_at IS NULL
    AND jps_status IS NOT NULL
    AND jps_status NOT IN ('Rejected', 'Allocated');
