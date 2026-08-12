-- Master shippers: entity (full + short name), plants (import), load ports (export).

ALTER TABLE master_shippers
  ADD COLUMN IF NOT EXISTS entity_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS short_name VARCHAR(255);

UPDATE master_shippers
SET
  entity_name = COALESCE(NULLIF(TRIM(entity_name), ''), TRIM(name)),
  short_name = COALESCE(NULLIF(TRIM(short_name), ''), TRIM(name))
WHERE entity_name IS NULL OR short_name IS NULL OR TRIM(entity_name) = '' OR TRIM(short_name) = '';

ALTER TABLE master_shippers
  ALTER COLUMN entity_name SET NOT NULL,
  ALTER COLUMN short_name SET NOT NULL;

-- Keep legacy `name` aligned with short_name for backward-compatible reads.
UPDATE master_shippers SET name = short_name WHERE name IS DISTINCT FROM short_name;

DROP INDEX IF EXISTS idx_ms_name_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ms_short_name_active
  ON master_shippers (LOWER(TRIM(short_name)))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ms_entity_name_active
  ON master_shippers (LOWER(TRIM(entity_name)))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS shipper_plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipper_id UUID NOT NULL REFERENCES master_shippers(id),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sp_shipper_name_active
  ON shipper_plants (shipper_id, LOWER(TRIM(name)))
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN master_shippers.entity_name IS 'Full entity name (Import: PT label; Export: shipper legal name)';
COMMENT ON COLUMN master_shippers.short_name IS 'Short code used as Import PT value and Export shipper value';
COMMENT ON TABLE shipper_plants IS 'Plants per entity (Import terminology)';

-- Seed canonical entities from legacy PT master (when not already present).
INSERT INTO master_shippers (entity_name, short_name, name, created_at, updated_at)
SELECT v.entity_name, v.short_name, v.short_name, NOW(), NOW()
FROM (VALUES
  ('ENERGI UNGGUL PERSADA', 'EUP'),
  ('ENERGI OLEO PERSADA', 'EOP'),
  ('PRIMUS SANUS COOKING OIL INDUSTRIAL (PT. PRISCOLIN)', 'Priscolin'),
  ('JATI PERKASA NUSANTARA', 'JPN'),
  ('ROYAL FOODS INDONESIA', 'RFI'),
  ('PRIMA MAKMUR CAKRAWALA', 'PMC'),
  ('SUMBER PANGAN CEMERLANG', 'SPC')
) AS v(entity_name, short_name)
WHERE NOT EXISTS (
  SELECT 1 FROM master_shippers ms
  WHERE ms.deleted_at IS NULL
    AND (
      LOWER(TRIM(ms.short_name)) = LOWER(TRIM(v.short_name))
      OR LOWER(TRIM(ms.entity_name)) = LOWER(TRIM(v.entity_name))
    )
);

-- Seed plants per entity.
INSERT INTO shipper_plants (shipper_id, name, created_at, updated_at)
SELECT ms.id, p.plant_name, NOW(), NOW()
FROM master_shippers ms
JOIN (VALUES
  ('EUP', 'BATAM'),
  ('EUP', 'BONTANG'),
  ('EUP', 'LUBUK GAUNG'),
  ('EUP', 'KIJING / TJ PURA'),
  ('EOP', 'MORAWA'),
  ('Priscolin', 'KARAWANG'),
  ('Priscolin', 'BEKASI'),
  ('JPN', 'SIDOARJO'),
  ('JPN', 'GRESIK'),
  ('RFI', 'BEKASI'),
  ('PMC', 'LUBUK GAUNG'),
  ('SPC', 'LUBUK GAUNG')
) AS p(short_name, plant_name) ON LOWER(TRIM(ms.short_name)) = LOWER(TRIM(p.short_name))
WHERE ms.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM shipper_plants sp
    WHERE sp.shipper_id = ms.id
      AND sp.deleted_at IS NULL
      AND LOWER(TRIM(sp.name)) = LOWER(TRIM(p.plant_name))
  );

-- Migrate stored Import PO PT values from full entity name to short name where possible.
UPDATE import_purchase_order po
SET pt = ms.short_name
FROM master_shippers ms
WHERE po.pt IS NOT NULL
  AND TRIM(po.pt) <> ''
  AND ms.deleted_at IS NULL
  AND LOWER(TRIM(po.pt)) = LOWER(TRIM(ms.entity_name))
  AND po.pt IS DISTINCT FROM ms.short_name;
