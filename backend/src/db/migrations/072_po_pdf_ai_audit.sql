-- PO PDF AI audit log + retire auto-learned templates.

-- Audit log for every Rescan-with-AI attempt (success or failure).
CREATE TABLE IF NOT EXISTS po_pdf_ai_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash CHAR(64) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename VARCHAR(500),
  po_number VARCHAR(100),
  template_code VARCHAR(80),
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
  confidence_before VARCHAR(10) CHECK (confidence_before IN ('high', 'medium', 'low')),
  confidence_after VARCHAR(10) CHECK (confidence_after IN ('high', 'medium', 'low')),
  items_before INT NOT NULL DEFAULT 0,
  items_after INT NOT NULL DEFAULT 0,
  item_completeness VARCHAR(20) CHECK (item_completeness IN ('complete', 'incomplete', 'unknown')),
  model VARCHAR(80),
  input_tokens INT,
  output_tokens INT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_pdf_ai_requests_created
  ON po_pdf_ai_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_pdf_ai_requests_user_created
  ON po_pdf_ai_requests (user_id, created_at DESC);

-- Extend call_type for quota table (successful extractions only).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'po_pdf_ai_call_type' AND e.enumlabel = 'extract'
  ) THEN
    ALTER TYPE po_pdf_ai_call_type ADD VALUE 'extract';
  END IF;
END $$;

-- Deactivate Claude auto-learned templates (no longer created; avoid bad regex matches).
UPDATE po_document_templates
SET is_active = FALSE, updated_at = NOW()
WHERE source = 'claude_learned';
