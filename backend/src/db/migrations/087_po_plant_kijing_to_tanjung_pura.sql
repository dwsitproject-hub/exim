-- Rename legacy EUP plant label on purchase orders.
UPDATE Import_purchase_order
SET plant = 'TANJUNG PURA',
    updated_at = NOW()
WHERE UPPER(TRIM(COALESCE(plant, ''))) IN (
  'KIJING / TJ PURA',
  'KIJING/TJ PURA'
);
