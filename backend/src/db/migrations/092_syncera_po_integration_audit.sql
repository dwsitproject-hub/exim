-- Syncera PO polling audit: one row per poll cycle + per-PO outcome events.

CREATE TABLE IF NOT EXISTS syncera_po_poll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',
  date_from CHAR(8) NOT NULL,
  date_to CHAR(8) NOT NULL,
  api_line_count INT NOT NULL DEFAULT 0,
  mapped_po_count INT NOT NULL DEFAULT 0,
  ingested INT NOT NULL DEFAULT 0,
  updated INT NOT NULL DEFAULT 0,
  unchanged INT NOT NULL DEFAULT 0,
  skipped_invalid INT NOT NULL DEFAULT 0,
  skipped_conflict INT NOT NULL DEFAULT 0,
  skipped_locked_amendment INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  error_message TEXT,
  CONSTRAINT syncera_po_poll_runs_status_check CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_syncera_po_poll_runs_started_at
  ON syncera_po_poll_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS syncera_po_integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES syncera_po_poll_runs (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome VARCHAR(40) NOT NULL,
  po_number VARCHAR(64),
  pt_code VARCHAR(16),
  external_id VARCHAR(255),
  intake_id UUID,
  message TEXT,
  CONSTRAINT syncera_po_integration_events_outcome_check CHECK (
    outcome IN (
      'ingested',
      'updated',
      'unchanged',
      'skipped_invalid',
      'skipped_conflict',
      'skipped_locked_amendment',
      'failed'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_syncera_po_integration_events_run_id
  ON syncera_po_integration_events (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_syncera_po_integration_events_created_at
  ON syncera_po_integration_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_syncera_po_integration_events_outcome
  ON syncera_po_integration_events (outcome);

COMMENT ON TABLE syncera_po_poll_runs IS 'Syncera GET /po-import poll cycle summary metrics.';
COMMENT ON TABLE syncera_po_integration_events IS 'Per-PO result for each Syncera poll cycle.';
