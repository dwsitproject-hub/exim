/**
 * PO intake DTOs. Intake from SaaS; duplicate prevention; status and assignment.
 */

export const INTAKE_STATUSES = [
  "NEW_PO_DETECTED",
  "CLAIMED",
  "ALLOCATION_IN_PROGRESS",
  "PARTIALLY_SHIPPED",
  "SHIPPED",
  "FULFILLED",
] as const;

export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export interface PoIntakeItemDto {
  line_number?: number;
  item_description?: string;
  qty?: number;
  unit?: string;
  value?: number;
}

/** PATCH /po/:id — same shape as create except no external_id; items may include `id` for existing lines. */
export interface UpdatePoIntakeItemDto {
  /** Existing line id; omit to insert a new line. */
  id?: string;
  line_number?: number;
  item_description: string;
  qty: number;
  unit: string;
  value: number;
}

export interface UpdatePoIntakeDto {
  po_number: string;
  plant?: string;
  pt?: string;
  supplier_name: string;
  delivery_location?: string;
  incoterm_location?: string;
  kawasan_berikat?: string;
  currency?: string;
  items: UpdatePoIntakeItemDto[];
}

/** Create intake (ingestion or test-create). Matches SaaS payload. Rule: 1 PO = multiple items, 1 incoterm. */
export interface CreatePoIntakeDto {
  external_id: string;
  po_number: string;
  plant?: string;
  /** Legal entity / PT code on PO header (distinct from plant). */
  pt?: string;
  supplier_name: string;
  delivery_location?: string;
  incoterm_location?: string;
  kawasan_berikat?: string;
  currency?: string;
  /** At least one line required (validated in create-intake.validator). */
  items: PoIntakeItemDto[];
}

/** List query. */
export interface ListPoIntakeQuery {
  page?: number;
  limit?: number;
  search?: string;
  intake_status?: string;
  po_number?: string;
  /** When true, only rows where `taken_by_user_id` is null (unclaimed). */
  unclaimed_only?: boolean;
  /** Filter by presence of an active (non-decoupled) shipment mapping. */
  has_linked_shipment?: boolean;
  /**
   * PO “detected” time uses `created_at`. When set (e.g. 2), only rows where
   * `created_at` is older than N full days from now (managerial stale POs).
   */
  detected_older_than_days?: number;
  /** Column filters (multi-select); combine with AND. Empty display value is sent as "—". */
  po_numbers?: string[];
  external_ids?: string[];
  pts?: string[];
  plants?: string[];
  supplier_names?: string[];
  delivery_locations?: string[];
  incoterm_locations?: string[];
  kawasan_berikats?: string[];
  currencies?: string[];
  intake_statuses?: string[];
  taken_by_user_ids?: string[];
  taken_by_names?: string[];
  taken_at_dates?: string[];
  created_at_dates?: string[];
  updated_at_dates?: string[];
  /** Client column id (e.g. `po_number`, `supplier`); server maps to SQL. */
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

/** GET /po/list-filter-options — distinct values for column filters (full table). */
export interface PoListFilterOptions {
  po_numbers: string[];
  external_ids: string[];
  pts: string[];
  plants: string[];
  supplier_names: string[];
  delivery_locations: string[];
  incoterm_locations: string[];
  kawasan_berikats: string[];
  currencies: string[];
  intake_statuses: string[];
  taken_by_user_ids: string[];
  taken_by_names: string[];
  taken_at_dates: string[];
  created_at_dates: string[];
  updated_at_dates: string[];
}

export interface PoIntakeRow {
  id: string;
  external_id: string;
  po_number: string;
  plant: string | null;
  pt: string | null;
  supplier_name: string;
  delivery_location: string | null;
  incoterm_location: string | null;
  kawasan_berikat: string | null;
  currency: string | null;
  intake_status: string;
  /** Set when a logged-in user created the PO (test-create, CSV). Null for automated ingestion. */
  created_by_user_id: string | null;
  taken_by_user_id: string | null;
  taken_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PoIntakeItemRow {
  id: string;
  import_purchase_order_id: string;
  line_number: number;
  item_description: string | null;
  qty: number | null;
  unit: string | null;
  value: number | null;
  created_at: Date;
}

export interface PoIntakeListItem {
  id: string;
  external_id: string;
  po_number: string;
  plant: string | null;
  pt: string | null;
  supplier_name: string;
  delivery_location: string | null;
  incoterm_location: string | null;
  kawasan_berikat: string | null;
  currency: string | null;
  intake_status: string;
  taken_by_user_id: string | null;
  taken_by_name: string | null;
  taken_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoIntakeDetail {
  id: string;
  external_id: string;
  po_number: string;
  plant: string | null;
  pt: string | null;
  supplier_name: string;
  delivery_location: string | null;
  incoterm_location: string | null;
  kawasan_berikat: string | null;
  currency: string | null;
  intake_status: string;
  taken_by_user_id: string | null;
  /** Display name of user who took ownership (when taken_by_user_id is set). */
  taken_by_name: string | null;
  taken_at: string | null;
  created_at: string;
  updated_at: string;
  items: {
    id: string;
    /** FK to `import_purchase_order.id` (same as parent detail `id`). */
    import_purchase_order_id: string;
    line_number: number;
    item_description: string | null;
    qty: number | null;
    unit: string | null;
    value: number | null;
    /** Received quantity (from deliveries/shipments). When no source: 0. */
    received_qty: number | null;
    /** Remaining qty from PO perspective: max(0, qty - received_qty). */
    remaining_qty: number | null;
    /** When received > qty: percentage of over-receipt, e.g. ((received - qty) / qty) * 100. */
    over_received_pct: number | null;
  }[];
  /** Shipments linked to this PO (deliveries interacting with this PO). */
  linked_shipments: {
    shipment_id: string;
    shipment_number: string;
    current_status: string;
    incoterm: string | null;
    coupled_at: string;
    coupled_by: string;
    atd: string | null;
    ata: string | null;
    /** When the shipment was closed (delivered). */
    delivered_at: string | null;
    /** Qty delivered on this shipment per PO line (0 if not recorded). */
    lines_received: {
      item_id: string;
      line_number: number;
      item_description: string | null;
      received_qty: number;
    }[];
  }[];
  /** True when total delivered qty across shipments exceeds total PO line qty. */
  overshipped: boolean;
}

export interface CreatePoIntakeResponse {
  id: string;
  external_id: string;
  po_number: string;
  intake_status: string;
  created_at: string;
}

export interface PoCsvImportErrorRow {
  row: number;
  field: string;
  po_number: string;
  message: string;
}

export interface PoCsvImportResult {
  total_rows: number;
  imported_pos: number;
  imported_rows: number;
  failed_rows: number;
  /** Short human-readable outcome (counts + common failure reasons). */
  summary: string;
  errors: PoCsvImportErrorRow[];
}

export interface PoImportHistoryRow {
  id: string;
  file_name: string | null;
  uploaded_by: string;
  total_rows: number;
  imported_pos: number;
  imported_rows: number;
  failed_rows: number;
  status: string;
  created_at: Date;
  finished_at: Date | null;
}

/** GET /po/:id/activity-log — merged audit trail (aligned with shipment activity shape). */
export interface PoIntakeActivityItem {
  id: string;
  type:
    | "po_created"
    | "po_claimed"
    | "couple_shipment"
    | "decouple_shipment"
    | "po_updated";
  title: string;
  detail: string | null;
  field_changes?: Array<{
    field: string;
    label: string;
    before: string | null;
    after: string | null;
  }>;
  actor: string;
  occurred_at: string;
}
