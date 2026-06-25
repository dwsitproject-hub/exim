-- Audit trail for documentation PIC reassignment after work has started.

CREATE TABLE IF NOT EXISTS export_bulking_documentation_assignment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES export_bulking_shipments(id) ON DELETE CASCADE,
  old_assignee_user_id UUID REFERENCES users(id),
  new_assignee_user_id UUID REFERENCES users(id),
  changed_by UUID NOT NULL REFERENCES users(id),
  reason TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ebs_doc_assignment_events_shipment
  ON export_bulking_documentation_assignment_events (shipment_id, changed_at DESC);
