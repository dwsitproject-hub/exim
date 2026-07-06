-- Seed canonical master commodities for export bulking cargo name combobox.

INSERT INTO master_commodities (short_name, name, commodity_type, created_at, updated_at)
SELECT v.short_name, v.name, v.commodity_type, NOW(), NOW()
FROM (VALUES
  ('CRUDE GLYCERINE', 'CRUDE GLYCERINE', 'Liquid'),
  ('REFINED GLYCERINE', 'REFINED GLYCERINE', 'Liquid'),
  ('FM', 'FM', 'Liquid'),
  ('IE PALM OIL', 'IE PALM OIL', 'Liquid'),
  ('IE PALM STEARIN', 'IE PALM STEARIN', 'Liquid'),
  ('CPO', 'CRUDE PALM OIL', 'Liquid'),
  ('ISCC RPOME', 'ISCC REFINED PALM OIL MILL EFFLUENT', 'Liquid'),
  ('INS RPOME', 'INS REFINED PALM OIL MILL EFFLUENT', 'Liquid'),
  ('ISCC POMEFAD', 'ISCC PALM OIL MILL EFFLUENT FATTY ACID DISTILLATE', 'Liquid'),
  ('INS POMEFAD', 'INS PALM OIL MILL EFFLUENT FATTY ACID DISTILLATE', 'Liquid'),
  ('PFAD', 'Palm Fatty Acid Distillate', 'Liquid'),
  ('ROL', 'Refined Olein', 'Liquid'),
  ('RBDPS', 'RBD PALM STEARIN', 'Liquid'),
  ('DPFA', 'DISTILLATE PALM FATTY ACID', 'Liquid'),
  ('OLEIC ACID', 'OLEIC ACID', 'Liquid'),
  ('SRBDPKOFA', 'SPLIT RBD PALM KERNEL OIL FATTY ACID', 'Liquid'),
  ('SRBDPSFA', 'SPLIT RBD PALM STEARIN FATTY ACID', 'Liquid'),
  ('SCPKOFA', 'SPLIT CRUDE PALM KERNEL OIL FATTY ACID', 'Liquid')
) AS v(short_name, name, commodity_type)
WHERE NOT EXISTS (
  SELECT 1 FROM master_commodities mc
  WHERE mc.deleted_at IS NULL
    AND LOWER(TRIM(mc.short_name)) = LOWER(TRIM(v.short_name))
);
