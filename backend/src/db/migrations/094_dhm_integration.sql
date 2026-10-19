-- DHM (Data Hub Management) master-data integration.
-- Local replica of two DHM masters consumed by EOS: `company` (maps to EOS vendor/supplier)
-- and `exchange_rate` (daily FX pairs synced by DHM from Coupa). See docs/DHM-INTEGRATION.md.
--
-- Pattern: "C" local replica (snapshot + incremental sync via /v1/sync, kept warm by webhooks)
-- plus "A" master owner for `company` only (EOS may create a new company in DHM via /v1/inbound
-- when an Import Officer types a vendor name DHM does not have yet). `exchange_rate` is read-only
-- from EOS's side — DHM/Coupa is the sole writer, EOS only looks it up (pattern B/C).

-- Local replica of DHM `company` records. Primary key is DHM's `id` (UUID); `code` is the
-- DHM-assigned identity (ORG-NNNN) used everywhere else in EOS (shipments.vendor_code).
CREATE TABLE IF NOT EXISTS dhm_companies (
  id UUID PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(255),
  company_code_sap VARCHAR(100),
  country VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  merged_into_code VARCHAR(20),
  /** Full DHM record.data payload, for fields EOS does not model explicitly yet. */
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  dhm_updated_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dhm_companies_code ON dhm_companies (code);
CREATE INDEX IF NOT EXISTS idx_dhm_companies_name_trgm ON dhm_companies (lower(name));
CREATE INDEX IF NOT EXISTS idx_dhm_companies_is_deleted ON dhm_companies (is_deleted);
CREATE INDEX IF NOT EXISTS idx_dhm_companies_updated_at ON dhm_companies (dhm_updated_at);

COMMENT ON TABLE dhm_companies IS
  'Local replica of DHM company master (slug=company). Source of truth is DHM; synced via /v1/sync + webhooks.';

-- Local replica of DHM `exchange_rate` records (per from/to currency pair, per day).
CREATE TABLE IF NOT EXISTS dhm_exchange_rates (
  id UUID PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  from_currency VARCHAR(10) NOT NULL,
  to_currency VARCHAR(10) NOT NULL,
  rate NUMERIC(24, 8) NOT NULL,
  rate_date DATE NOT NULL,
  from_decimals SMALLINT,
  to_decimals SMALLINT,
  coupa_id VARCHAR(100),
  coupa_updated_at VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  dhm_updated_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dhm_exchange_rates_code ON dhm_exchange_rates (code);
-- Fast "rate for USD->IDR on/before 2026-10-01" lookups.
CREATE INDEX IF NOT EXISTS idx_dhm_exchange_rates_pair_date
  ON dhm_exchange_rates (from_currency, to_currency, rate_date DESC)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_dhm_exchange_rates_updated_at ON dhm_exchange_rates (dhm_updated_at);

COMMENT ON TABLE dhm_exchange_rates IS
  'Local replica of DHM exchange_rate master (slug=exchange_rate), synced from Coupa by DHM. Read-only from EOS.';

-- Per-entity sync cursor so incremental /v1/sync polling resumes where it left off across restarts.
CREATE TABLE IF NOT EXISTS dhm_sync_state (
  entity_type VARCHAR(50) PRIMARY KEY,
  cursor TEXT,
  last_synced_at TIMESTAMPTZ,
  last_record_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE dhm_sync_state IS
  'Resume cursor + last-run status per DHM entity type (company, exchange_rate).';

-- Webhook delivery dedupe: DHM "Delivery-Id" is stable on replay; apply each delivery at most once.
CREATE TABLE IF NOT EXISTS dhm_webhook_deliveries (
  delivery_id UUID PRIMARY KEY,
  event VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  record_id UUID,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dhm_webhook_deliveries_received_at ON dhm_webhook_deliveries (received_at);

COMMENT ON TABLE dhm_webhook_deliveries IS
  'Dedupe store for DHM webhook X-DHM-Delivery-Id. Rows older than a few days may be purged.';

-- Inbound submissions EOS made to DHM (pattern A: create-a-company). Tracks pending_review/duplicate
-- outcomes so the UI can show "awaiting steward review" instead of re-submitting.
CREATE TABLE IF NOT EXISTS dhm_inbound_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  dhm_inbound_id UUID,
  idempotency_key VARCHAR(200) NOT NULL,
  request_payload JSONB NOT NULL,
  status VARCHAR(30) NOT NULL, -- created | updated | pending_review | duplicate | rejected | error
  result_code VARCHAR(20),
  result_message TEXT,
  submitted_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dhm_inbound_submissions_idem
  ON dhm_inbound_submissions (entity_type, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_dhm_inbound_submissions_dhm_inbound_id ON dhm_inbound_submissions (dhm_inbound_id);

COMMENT ON TABLE dhm_inbound_submissions IS
  'Audit trail of EOS -> DHM /v1/inbound POST/PUT calls (pattern A: EOS may create companies).';
