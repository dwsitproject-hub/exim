export const EXPORT_BULKING_STATUSES = [
  "SHIPMENT_PLANNING",
  "NOMINATION",
  "SI_RECEIVE",
  "VOYAGE_OPERATIONS",
] as const;

export type ExportBulkingStatus = (typeof EXPORT_BULKING_STATUSES)[number];

export const EXPORT_BULKING_STATUS_LABELS: Record<ExportBulkingStatus, string> = {
  SHIPMENT_PLANNING: "Shipment Planning",
  NOMINATION: "Nomination",
  SI_RECEIVE: "SI Received",
  VOYAGE_OPERATIONS: "Voyage / Port Operations",
};

export function formatExportBulkingStatus(raw: string | null | undefined): string {
  if (!raw) return "—";
  return EXPORT_BULKING_STATUS_LABELS[raw as ExportBulkingStatus] ?? raw.replace(/_/g, " ");
}

export interface ExportBulkingListItem {
  id: string;
  shipment_no: string;
  current_status: string;
  vessel_name: string | null;
  voyage_number: string | null;
  shipper: string | null;
  loadport_name: string | null;
  received_nomination?: string | null;
  eta: string | null;
  ata: string | null;
  etb: string | null;
  atb: string | null;
  td: string | null;
  surveyor: string | null;
  incoterms: string | null;
  total_quantity: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  cargo_count?: number;
  cargo_summaries?: { item_description: string | null; destination_port: string | null }[] | null;
  si_numbers?: string[] | null;
  invoice_numbers?: string[] | null;
  pl_numbers?: string[] | null;
  invoice_line_summaries?: { contract_no: string | null; quantity: number | null; so_no: string | null }[] | null;
}

export interface ExportBulkingShipmentDetail {
  id: string;
  shipment_no: string;
  current_status: string;
  vessel_name: string | null;
  voyage_number: string | null;
  shipper: string | null;
  loadport_name: string | null;
  received_nomination: string | null;
  received_shipping_instruction: string | null;
  incoterms: string | null;
  laycan: string | null;
  laycan_from: string | null;
  laycan_to: string | null;
  est_cargo_readiness: string | null;
  est_cargo_readiness_period: string | null;
  eta: string | null;
  ata: string | null;
  etb: string | null;
  atb: string | null;
  commence_loading: string | null;
  etc: string | null;
  atc: string | null;
  td: string | null;
  surveyor: string | null;
  surveyor_reason: string | null;
  agent: string | null;
  laytime_rate_mtph: number | null;
  demurrage_rate_pdpr: number | null;
  total_quantity: number | null;
  remarks: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cargo_lines: CargoLine[];
  shipping_instructions: ShippingInstruction[];
  invoices: Invoice[];
  packing_lists: PackingList[];
}

export interface CargoLine {
  id: string;
  shipment_id: string;
  line_order: number;
  cargo_name: string;
  quantity: number | null;
  unit: string | null;
  item_description: string | null;
  destination_port: string | null;
  destination_country: string | null;
  country_area: string | null;
}

/** Body items for PUT .../cargos (full rows may include id; new rows omit id). */
export type CargoLineUpsertPayload = {
  id?: string;
  line_order: number;
  cargo_name: string;
  quantity: number | null;
  unit: string | null;
  item_description: string | null;
  destination_port: string | null;
  destination_country?: string | null;
  country_area?: string | null;
};

export interface ShippingInstruction {
  id: string;
  shipment_id: string;
  si_number: string | null;
  /** Forwarding agency (MESSRS line on SI document). */
  messrs?: string | null;
  /** User id of who last holds the auto-generated document number (server; internal bookkeeping). */
  doc_number_held_by_user_id?: string | null;
  bill_of_lading_option: string | null;
  consignee: string | null;
  notify_party: string | null;
  freight: string | null;
  shipper_snapshot: string | null;
  npwp: string | null;
  bl_indicated: string | null;
  status: string;
  lines: SiLine[];
}

export interface SiLine {
  id: string;
  si_id: string;
  cargo_line_id: string | null;
  description_of_goods: string | null;
  quantity: number | null;
  bl_split_qty: number | null;
  destination_port: string | null;
}

export interface Invoice {
  id: string;
  shipment_id: string;
  shipping_instruction_id?: string | null;
  invoice_no: string | null;
  doc_number_held_by_user_id?: string | null;
  invoice_date: string | null;
  messrs: string | null;
  vessel_voyage_snapshot: string | null;
  loadport_snapshot: string | null;
  destination_snapshot: string | null;
  marks: string | null;
  status: string;
  lines: InvoiceLine[];
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  cargo_line_id: string | null;
  item_no: number | null;
  description_of_goods: string | null;
  contract_no: string | null;
  so_no: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_amount: number | null;
}

export interface PackingList {
  id: string;
  shipment_id: string;
  packing_list_number: string | null;
  doc_number_held_by_user_id?: string | null;
  loadport_snapshot: string | null;
  destination_snapshot: string | null;
  status: string;
  lines: PackingListLine[];
}

export interface PackingListLine {
  id: string;
  packing_list_id: string;
  cargo_line_id: string | null;
  description_of_goods: string | null;
  quantity: number | null;
  destination_snapshot: string | null;
  packing: string | null;
}

export interface ExportBulkingFilterOptions {
  statuses: string[];
  vessel_names: string[];
  voyage_numbers: string[];
  shippers: string[];
  loadport_names: string[];
  surveyors: string[];
  incoterms: string[];
  /** Total shipment count per raw status key, e.g. { SHIPMENT_PLANNING: 5, NOMINATION: 3 } */
  status_counts?: Record<string, number>;
}

export interface ListExportBulkingQuery {
  page?: number;
  limit?: number;
  search?: string;
  statuses?: string[];
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

export interface StatusEvent {
  id: string;
  shipment_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  changed_at: string;
  remarks: string | null;
}
