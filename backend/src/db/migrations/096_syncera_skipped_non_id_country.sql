-- Syncera audit: skip POs whose PT matches company_master but country is not Indonesia (ID).

ALTER TABLE syncera_po_poll_runs
  ADD COLUMN IF NOT EXISTS skipped_non_id_country INT NOT NULL DEFAULT 0;

ALTER TABLE syncera_po_integration_events
  DROP CONSTRAINT IF EXISTS syncera_po_integration_events_outcome_check;

ALTER TABLE syncera_po_integration_events
  ADD CONSTRAINT syncera_po_integration_events_outcome_check CHECK (
    outcome IN (
      'ingested',
      'updated',
      'unchanged',
      'skipped_invalid',
      'skipped_conflict',
      'skipped_locked_amendment',
      'skipped_unknown_pt',
      'skipped_non_id_country',
      'failed'
    )
  );
