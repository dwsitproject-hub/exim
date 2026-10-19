-- Rework DHM company replica into EOS-owned company_master (surrogate id),
-- add site_master + plant_master (Company 1:N Site 1:N Plant), and extend
-- Syncera poll audit with skipped_unknown_pt.
--
-- Transaction tables (import_purchase_order.pt / .plant) stay free-text snapshots.
-- Master data is lookup-only (dropdown source + Syncera PT filter).

-- ---------------------------------------------------------------------------
-- company_master: rename dhm_companies and mint EOS-owned surrogate ids
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS dhm_companies RENAME TO company_master;

ALTER TABLE company_master RENAME COLUMN id TO dhm_id;
ALTER TABLE company_master RENAME COLUMN code TO dhm_code;

ALTER TABLE company_master DROP CONSTRAINT IF EXISTS dhm_companies_pkey;
ALTER TABLE company_master DROP CONSTRAINT IF EXISTS company_master_pkey;

ALTER TABLE company_master ADD COLUMN IF NOT EXISTS id UUID;
UPDATE company_master SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE company_master ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE company_master ALTER COLUMN id SET NOT NULL;
ALTER TABLE company_master ADD PRIMARY KEY (id);

DROP INDEX IF EXISTS idx_dhm_companies_code;
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_master_dhm_id ON company_master (dhm_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_master_dhm_code ON company_master (dhm_code);

ALTER INDEX IF EXISTS idx_dhm_companies_name_trgm RENAME TO idx_company_master_name;
ALTER INDEX IF EXISTS idx_dhm_companies_is_deleted RENAME TO idx_company_master_is_deleted;
ALTER INDEX IF EXISTS idx_dhm_companies_updated_at RENAME TO idx_company_master_updated_at;

COMMENT ON TABLE company_master IS
  'EOS-owned replica of DHM company (internal legal entity / PT). id is EOS surrogate; dhm_id/dhm_code are external references.';

-- ---------------------------------------------------------------------------
-- site_master: internal-only join between company and plant (not shown in UI)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS site_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dhm_id UUID NOT NULL,
  dhm_code VARCHAR(20) NOT NULL,
  company_master_id UUID NOT NULL REFERENCES company_master (id),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  dhm_updated_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_site_master_dhm_id ON site_master (dhm_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_site_master_dhm_code ON site_master (dhm_code);
CREATE INDEX IF NOT EXISTS idx_site_master_company ON site_master (company_master_id);
CREATE INDEX IF NOT EXISTS idx_site_master_is_deleted ON site_master (is_deleted);

COMMENT ON TABLE site_master IS
  'EOS-owned replica of DHM site. Used only to resolve plant -> company; not exposed in the EOS UI.';

-- ---------------------------------------------------------------------------
-- plant_master: DHM plant (SAP plant_code + location name) under a company
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plant_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dhm_id UUID NOT NULL,
  dhm_code VARCHAR(20) NOT NULL,
  site_master_id UUID NOT NULL REFERENCES site_master (id),
  company_master_id UUID NOT NULL REFERENCES company_master (id),
  plant_code VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  version INTEGER NOT NULL DEFAULT 1,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  dhm_updated_at TIMESTAMPTZ NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_plant_master_dhm_id ON plant_master (dhm_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_plant_master_dhm_code ON plant_master (dhm_code);
CREATE INDEX IF NOT EXISTS idx_plant_master_company ON plant_master (company_master_id);
CREATE INDEX IF NOT EXISTS idx_plant_master_site ON plant_master (site_master_id);
CREATE INDEX IF NOT EXISTS idx_plant_master_plant_code ON plant_master (lower(plant_code));
CREATE INDEX IF NOT EXISTS idx_plant_master_name ON plant_master (lower(name));
CREATE INDEX IF NOT EXISTS idx_plant_master_is_deleted ON plant_master (is_deleted);

COMMENT ON TABLE plant_master IS
  'EOS-owned replica of DHM plant. plant_code is the SAP code; name is the location snapshot used on POs.';

-- ---------------------------------------------------------------------------
-- Syncera audit: skip POs whose PT is not in company_master
-- ---------------------------------------------------------------------------

ALTER TABLE syncera_po_poll_runs
  ADD COLUMN IF NOT EXISTS skipped_unknown_pt INT NOT NULL DEFAULT 0;

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
      'failed'
    )
  );
