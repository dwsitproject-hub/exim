-- PO document layout templates for OCR/regex parsing (SAP, Coupa, Claude-learned).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'po_document_template_source') THEN
    CREATE TYPE po_document_template_source AS ENUM ('seeded', 'claude_learned');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS po_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  fingerprint_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  number_format VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (number_format IN ('us', 'eu', 'auto')),
  field_patterns JSONB NOT NULL DEFAULT '{}'::jsonb,
  item_row_pattern TEXT,
  source po_document_template_source NOT NULL DEFAULT 'seeded',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_document_templates_active
  ON po_document_templates (is_active) WHERE is_active = TRUE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'po_pdf_ai_call_type') THEN
    CREATE TYPE po_pdf_ai_call_type AS ENUM ('learn', 'repair');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS po_pdf_ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash CHAR(64) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_type po_pdf_ai_call_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_hash, user_id)
);

CREATE INDEX IF NOT EXISTS idx_po_pdf_ai_usage_user_created
  ON po_pdf_ai_usage (user_id, created_at DESC);

-- Seed SAP template
INSERT INTO po_document_templates (code, name, fingerprint_phrases, number_format, field_patterns, item_row_pattern, source)
VALUES (
  'sap',
  'SAP Purchase Order',
  '["SAP PO No", "Purchase Order No", "Document No"]'::jsonb,
  'us',
  '{
    "po_number": ["SAP\\\\s+PO\\\\s+No[.\\\\s:+]+(\\\\d{6,})", "Purchase\\\\s+Order\\\\s+No[.\\\\s:]+([A-Z0-9][\\\\w-]{3,})", "Document\\\\s+No[.\\\\s:]+(\\\\d{8,})"],
    "supplier": ["Vendor[:\\\\s]+([A-Z][A-Z0-9\\\\s.,&()''-]{5,80})"]
  }'::jsonb,
  NULL,
  'seeded'
)
ON CONFLICT (code) DO NOTHING;

-- Seed Coupa template
INSERT INTO po_document_templates (code, name, fingerprint_phrases, number_format, field_patterns, item_row_pattern, source)
VALUES (
  'coupa',
  'Coupa Purchase Order',
  '["Purchase Order #", "To :", "Item Description"]'::jsonb,
  'us',
  '{
    "po_number": ["Purchase\\\\s+Order\\\\s+#\\\\s*([A-Z0-9][\\\\w-]{3,})"],
    "supplier": ["^To\\\\s*[:\\\\s©@]+([A-Z][A-Z0-9\\\\s.,&()''-]{5,}?)(?:\\\\s{2,}|$)", "Vendor[:\\\\s]+([A-Z][A-Z0-9\\\\s.,&()''-]{5,80})"]
  }'::jsonb,
  NULL,
  'seeded'
)
ON CONFLICT (code) DO NOTHING;
