/**
 * Shipments API types — align with backend GET /shipments, GET /shipments/:id.
 */

/** Operational timeline `current_status` values (backend `SHIPMENT_STATUSES`). */
export type ShipmentStatus =
  | "INITIATE_SHIPPING_DOCUMENT"
  | "BIDDING_TRANSPORTER"
  | "TRANSPORT_CONFIRMED"
  | "READY_PICKUP"
  | "PICKED_UP"
  | "ON_SHIPMENT"
  | "CUSTOMS_CLEARANCE"
  | "DELIVERED";

export interface LinkedPoLineReceived {
  item_id: string;
  received_qty: number;
  item_description: string | null;
  bm_percentage: number | null;
  ppn_percentage: number | null;
  pph_percentage: number | null;
}

/** PO line row in shipment list expand panel. */
export interface ShipmentListPoLineItem {
  item_description: string | null;
  /** Quantity on the PO line. */
  qty_po: number | string | null;
  /** Quantity delivered on this shipment; null if not recorded. */
  delivery_qty: number | string | null;
  unit: string | null;
  bm_percentage?: number | null;
  ppn_percentage?: number | null;
  pph_percentage?: number | null;
}

/** Linked PO with lines for shipment list. */
export interface ShipmentListLinkedPo {
  intake_id: string;
  po_number: string;
  pt: string | null;
  plant: string | null;
  taken_by_name: string | null;
  currency: string | null;
  intake_status: string | null;
  items: ShipmentListPoLineItem[];
}

export interface LinkedPoSummary {
  intake_id: string;
  po_number: string;
  /** Legal entity / PT code from PO header. */
  pt: string | null;
  plant: string | null;
  supplier_name: string;
  incoterm_location: string | null;
  currency: string | null;
  invoice_no: string | null;
  currency_rate: number | null;
  coupled_at: string;
  coupled_by: string;
  taken_by_name: string | null;
  line_received: LinkedPoLineReceived[];
}

/** Currency for freight charges (shipment) and forwarder bid service amounts. */
export type FreightChargeCurrency = "USD" | "IDR";

export interface ShipmentListItem {
  id: string;
  shipment_number: string;
  supplier_name: string | null;
  vendor_name: string | null;
  incoterm: string | null;
  pib_type: string | null;
  shipment_method: string | null;
  product_classification: string | null;
  ship_by: string | null;
  forwarder_name: string | null;
  origin_port_name: string | null;
  destination_port_name: string | null;
  current_status: ShipmentStatus;
  etd: string | null;
  eta: string | null;
  linked_po_count: number;
  pic_name: string | null;
  display_pt: string | null;
  display_plant: string | null;
  closed_at: string | null;
  linked_pos: ShipmentListLinkedPo[];
}

export interface ShipmentDetail {
  id: string;
  shipment_number: string;
  vendor_code: string | null;
  vendor_name: string | null;
  forwarder_code: string | null;
  forwarder_name: string | null;
  warehouse_code: string | null;
  warehouse_name: string | null;
  incoterm: string | null;
  shipment_method: string | null;
  origin_port_code: string | null;
  origin_port_name: string | null;
  origin_port_country: string | null;
  destination_port_code: string | null;
  destination_port_name: string | null;
  destination_port_country: string | null;
  etd: string | null;
  eta: string | null;
  /** Actual time of departure */
  atd: string | null;
  /** Actual time of arrival */
  ata: string | null;
  /** Depot drop: yes / no */
  depo: boolean | null;
  depo_location: string | null;
  current_status: ShipmentStatus;
  closed_at: string | null;
  close_reason: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  pic_name: string | null;
  pib_type: string | null;
  no_request_pib: string | null;
  ppjk_mkl: string | null;
  nopen: string | null;
  nopen_date: string | null;
  ship_by: string | null;
  bl_awb: string | null;
  insurance_no: string | null;
  coo: string | null;
  incoterm_amount: number | null;
  incoterm_currency: FreightChargeCurrency;
  cbm: number | null;
  net_weight_mt: number | null;
  gross_weight_mt: number | null;
  kawasan_berikat: string | null;
  /** Yes / No */
  surveyor: string | null;
  /** Chemical, Packaging, or Spare Parts */
  product_classification: string | null;
  /** Pre-shipment unit options (container / package). */
  unit_20ft: boolean;
  unit_40ft: boolean;
  unit_package: boolean;
  unit_20_iso_tank: boolean;
  container_count_20ft: number | null;
  container_count_40ft: number | null;
  /** LCL: package quantity when unit_package is true */
  package_count: number | null;
  /** FCL: 20′ ISO tank quantity when unit_20_iso_tank is true */
  container_count_20_iso_tank: number | null;
  /** Total invoice in IDR: linked POs share currency & rate — IDR/RP = Σ(qty×price); else Σ(qty×price) × group rate. */
  total_items_amount: number;
  /** BM total (IDR), user-entered on shipment. */
  bm: number;
  /** PPN total (IDR), user-entered on shipment. */
  ppn: number;
  /** PPH total (IDR), user-entered on shipment. */
  pph: number;
  /** PDRI = BM + PPN + PPH (system sum). */
  pdri: number;
  linked_pos: LinkedPoSummary[];
}

/** Comment on a shipment (GET/POST /shipments/:id/notes). Newest first from API. */
export interface ShipmentNote {
  id: string;
  shipment_id: string;
  note: string;
  created_by_user_id: string | null;
  created_by_name: string;
  created_at: string;
}

/** GET/POST /shipments/:id/documents — files stored locally on server (storage_key). */
export interface ShipmentDocumentListItem {
  id: string;
  shipment_id: string;
  document_type: string;
  status: string | null;
  /** PO: linked PO intake; other types are null (legacy packing rows may still have intake_id). */
  intake_id: string | null;
  po_number: string | null;
  original_file_name: string;
  mime_type: string | null;
  size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
}

export interface ListShipmentsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  supplier_name?: string;
  po_number?: string;
  from_date?: string;
  to_date?: string;
  /** Inclusive YYYY-MM-DD on shipment `created_at` (UTC date). */
  created_from?: string;
  created_to?: string;
  /** Effective PO date: `imported_po_intake.po_date`, else intake created date (UTC). */
  po_from_date?: string;
  po_to_date?: string;
  /**
   * Matches backend: not closed (`closed_at` null) and status not DELIVERED.
   * Use for KPIs such as dashboard “active” shipment count.
   */
  active_pipeline?: boolean;
  pt?: string;
  plant?: string;
  pts?: string[];
  plants?: string[];
  product_classification?: string;
  product_classifications?: string[];
  shipment_method?: string;
  vendor_name_exact?: string;
  vendor_names_exact?: string[];
  statuses?: string[];
  shipment_nos?: string[];
  po_numbers?: string[];
  incoterms?: string[];
  pib_types?: string[];
  shipment_methods?: string[];
  ship_bys?: string[];
  forwarder_names?: string[];
  pic_names?: string[];
  etd_dates?: string[];
  eta_dates?: string[];
  origin_port_names?: string[];
  destination_port_names?: string[];
  /** Managerial deep-link: remaining PO line qty & shipment not updated recently. */
  dormant_remaining_qty?: boolean;
  dormant_days?: number;
  /**
   * Shipment performance “late / delayed”: not delivered, ETA set, ETA date before today (UTC).
   * Query param: `performance_eta_late=true`.
   */
  performance_eta_late?: boolean;
  /** Shipment list column id; backend maps to SQL. */
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

/** Full-database distinct values for shipment list column filters. */
export interface ShipmentListFilterOptions {
  statuses: string[];
  shipment_numbers: string[];
  pts: string[];
  plants: string[];
  vendors: string[];
  po_numbers: string[];
  incoterms: string[];
  pib_types: string[];
  shipment_methods: string[];
  product_classifications: string[];
  ship_bys: string[];
  forwarder_names: string[];
  pic_names: string[];
  etd_dates: string[];
  eta_dates: string[];
  origin_port_names: string[];
  destination_port_names: string[];
}

export interface ShipmentTimelineEntry {
  sequence: number;
  status: string;
  changed_at: string;
  changed_by: string;
  remarks: string | null;
}

export interface ShipmentStatusSummaryData {
  current_status: ShipmentStatus;
  previous_status: string | null;
  last_updated_at: string;
}

export type ShipmentActivityType =
  | "shipment_created"
  | "status_change"
  | "note"
  | "couple_po"
  | "decouple_po"
  | "shipment_updated";

export interface ShipmentActivityItem {
  id: string;
  type: ShipmentActivityType;
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

export interface ShipmentBid {
  id: string;
  shipment_id: string;
  forwarder_name: string;
  service_amount: number | null;
  service_amount_currency: FreightChargeCurrency;
  duration: string | null;
  /** Optional calendar expiry (YYYY-MM-DD) for quotation validity. */
  quotation_expires_at?: string | null;
  origin_port: string | null;
  destination_port: string | null;
  ship_via: string | null;
  quotation_file_name: string | null;
  quotation_storage_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecentForwarderBid {
  forwarder_name: string;
  shipment_id: string;
  duration: string | null;
  quotation_expires_at?: string | null;
  service_amount: number | null;
  service_amount_currency: FreightChargeCurrency;
  origin_port: string | null;
  destination_port: string | null;
  /** Origin port country on the past shipment that held this bid (matches current shipment’s origin country filter). */
  origin_country: string | null;
  /** Destination port country on that past shipment (informational). */
  destination_country: string | null;
  ship_via: string | null;
  updated_at: string;
}

export interface ShipmentImportCsvErrorRow {
  row: number;
  field: string;
  shipment_no: string;
  po_number: string;
  message: string;
}

export interface ShipmentImportCsvResult {
  total_rows: number;
  imported_shipments: number;
  imported_rows: number;
  failed_rows: number;
  summary: string;
  errors: ShipmentImportCsvErrorRow[];
}

export interface ShipmentImportHistoryItem {
  id: string;
  file_name: string | null;
  uploaded_by: string;
  total_rows: number;
  imported_shipments: number;
  imported_rows: number;
  failed_rows: number;
  status: string;
  created_at: string;
  finished_at: string | null;
}

