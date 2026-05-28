-- import_purchase_order_items: FK column intake_id -> import_purchase_order_id (matches import_purchase_order.id).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'import_purchase_order_items'
      AND column_name = 'intake_id'
  ) THEN
    ALTER TABLE import_purchase_order_items
      RENAME COLUMN intake_id TO import_purchase_order_id;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.idx_import_purchase_order_items_intake_id') IS NOT NULL
     AND to_regclass('public.idx_import_purchase_order_items_import_purchase_order_id') IS NULL THEN
    ALTER INDEX idx_import_purchase_order_items_intake_id
      RENAME TO idx_import_purchase_order_items_import_purchase_order_id;
  END IF;
END $$;
