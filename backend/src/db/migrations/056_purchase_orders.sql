-- Coupa / SaaS purchase order JSON ingested to `purchase_orders` before sync into import_purchase_order / import_purchase_order_items.
-- po_number matches type and length of import_purchase_order.po_number (VARCHAR(100)).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'coupa_purchase_order_staging_status'
      AND n.nspname = 'public'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_type t2
    JOIN pg_namespace n2 ON n2.oid = t2.typnamespace
    WHERE t2.typname = 'purchase_orders_status'
      AND n2.nspname = 'public'
  ) THEN
    ALTER TYPE coupa_purchase_order_staging_status RENAME TO purchase_orders_status;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_orders_status') THEN
    CREATE TYPE purchase_orders_status AS ENUM (
      'pending',
      'processed',
      'failed',
      'skipped'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status purchase_orders_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_purchase_orders_po_number UNIQUE (po_number)
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
  ON purchase_orders (status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status_created
  ON purchase_orders (status, created_at)
  WHERE status = 'pending';

COMMENT ON TABLE purchase_orders IS
  'Ingested purchase order documents (JSON) before promote to import_purchase_order. po_number = SAP from custom-fields.sap-po-no.';

COMMENT ON COLUMN purchase_orders.po_number IS
  'SAP PO number; must align with import_purchase_order when imported.';

COMMENT ON COLUMN purchase_orders.payload IS
  'Full order JSON as returned by the API.';
