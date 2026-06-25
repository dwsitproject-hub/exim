/** Shared activity log row shape (import shipment, PO intake, export bulking). */

export interface ActivityLogFieldChange {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
}

export interface ActivityLogItem {
  id: string;
  type: string;
  title: string;
  detail: string | null;
  field_changes?: ActivityLogFieldChange[];
  actor: string;
  occurred_at: string;
}

export interface ActivityLogResponse {
  items: ActivityLogItem[];
}
