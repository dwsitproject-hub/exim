-- Export Bulking: shipments, cargo lines, shipping instructions, invoices, packing lists, status events.

-- 1. Parent shipment
CREATE TABLE IF NOT EXISTS export_bulking_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_no VARCHAR(50) NOT NULL UNIQUE,
  current_status VARCHAR(50) NOT NULL DEFAULT 'SHIPMENT_PLANNING',

  -- General Information
  vessel_name VARCHAR(255),
  voyage_number VARCHAR(100),
  shipper VARCHAR(255),
  loadport_code VARCHAR(50),
  loadport_name VARCHAR(255),

  -- Nomination
  received_nomination TIMESTAMPTZ,
  received_shipping_instruction TIMESTAMPTZ,
  incoterms VARCHAR(50),
  laycan VARCHAR(255),
  est_cargo_readiness TIMESTAMPTZ,
  eta TIMESTAMPTZ,
  ata TIMESTAMPTZ,
  etb TIMESTAMPTZ,
  atb TIMESTAMPTZ,
  commence_loading TIMESTAMPTZ,
  etc TIMESTAMPTZ,
  atc TIMESTAMPTZ,
  td TIMESTAMPTZ,
  surveyor VARCHAR(255),
  laytime_rate_mtph NUMERIC(18, 4),
  demurrage_rate_pdpr NUMERIC(18, 4),

  remarks TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ebs_shipment_no ON export_bulking_shipments (shipment_no);
CREATE INDEX IF NOT EXISTS idx_ebs_current_status ON export_bulking_shipments (current_status);
CREATE INDEX IF NOT EXISTS idx_ebs_created_at ON export_bulking_shipments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ebs_deleted_at ON export_bulking_shipments (deleted_at) WHERE deleted_at IS NULL;

-- 2. Cargo lines
CREATE TABLE IF NOT EXISTS export_bulking_cargo_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES export_bulking_shipments (id) ON DELETE CASCADE,
  line_order INT NOT NULL DEFAULT 1,
  cargo_name VARCHAR(255) NOT NULL,
  quantity NUMERIC(18, 4),
  unit VARCHAR(50),
  item_description TEXT,
  destination_port VARCHAR(255),
  destination_country VARCHAR(255),
  country_area VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebs_cargo_shipment_id ON export_bulking_cargo_lines (shipment_id);

-- 3. Shipping Instructions (header)
CREATE TABLE IF NOT EXISTS export_bulking_shipping_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES export_bulking_shipments (id) ON DELETE CASCADE,
  si_number VARCHAR(100),
  bill_of_lading_option VARCHAR(100),
  consignee TEXT,
  notify_party TEXT,
  freight VARCHAR(100),
  shipper_snapshot VARCHAR(255),
  npwp VARCHAR(100),
  bl_indicated TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebs_si_shipment_id ON export_bulking_shipping_instructions (shipment_id);

-- 4. Shipping Instruction lines
CREATE TABLE IF NOT EXISTS export_bulking_si_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  si_id UUID NOT NULL REFERENCES export_bulking_shipping_instructions (id) ON DELETE CASCADE,
  cargo_line_id UUID REFERENCES export_bulking_cargo_lines (id) ON DELETE SET NULL,
  description_of_goods TEXT,
  quantity NUMERIC(18, 4),
  bl_split_qty NUMERIC(18, 4),
  destination_port VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebs_si_lines_si_id ON export_bulking_si_lines (si_id);
CREATE INDEX IF NOT EXISTS idx_ebs_si_lines_cargo ON export_bulking_si_lines (cargo_line_id);

-- 5. Invoices (header)
CREATE TABLE IF NOT EXISTS export_bulking_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES export_bulking_shipments (id) ON DELETE CASCADE,
  invoice_no VARCHAR(100),
  invoice_date DATE,
  messrs TEXT,
  vessel_voyage_snapshot VARCHAR(255),
  loadport_snapshot VARCHAR(255),
  destination_snapshot VARCHAR(255),
  marks TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebs_inv_shipment_id ON export_bulking_invoices (shipment_id);

-- 6. Invoice lines
CREATE TABLE IF NOT EXISTS export_bulking_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES export_bulking_invoices (id) ON DELETE CASCADE,
  cargo_line_id UUID REFERENCES export_bulking_cargo_lines (id) ON DELETE SET NULL,
  item_no INT,
  description_of_goods TEXT,
  contract_no VARCHAR(100),
  so_no VARCHAR(100),
  quantity NUMERIC(18, 4),
  unit_price NUMERIC(18, 4),
  total_amount NUMERIC(18, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebs_inv_lines_invoice_id ON export_bulking_invoice_lines (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ebs_inv_lines_cargo ON export_bulking_invoice_lines (cargo_line_id);

-- 7. Packing Lists (header)
CREATE TABLE IF NOT EXISTS export_bulking_packing_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES export_bulking_shipments (id) ON DELETE CASCADE,
  packing_list_number VARCHAR(100),
  loadport_snapshot VARCHAR(255),
  destination_snapshot VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebs_pl_shipment_id ON export_bulking_packing_lists (shipment_id);

-- 8. Packing List lines
CREATE TABLE IF NOT EXISTS export_bulking_packing_list_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packing_list_id UUID NOT NULL REFERENCES export_bulking_packing_lists (id) ON DELETE CASCADE,
  cargo_line_id UUID REFERENCES export_bulking_cargo_lines (id) ON DELETE SET NULL,
  description_of_goods TEXT,
  quantity NUMERIC(18, 4),
  destination_snapshot VARCHAR(255),
  packing TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebs_pl_lines_pl_id ON export_bulking_packing_list_lines (packing_list_id);
CREATE INDEX IF NOT EXISTS idx_ebs_pl_lines_cargo ON export_bulking_packing_list_lines (cargo_line_id);

-- 9. Status events (append-only audit log)
CREATE TABLE IF NOT EXISTS export_bulking_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES export_bulking_shipments (id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remarks TEXT
);

CREATE INDEX IF NOT EXISTS idx_ebs_status_events_shipment ON export_bulking_status_events (shipment_id, changed_at DESC);
