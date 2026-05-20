export const EXPORT_BULKING_STATUSES = [
  "SHIPMENT_PLANNING",
  "NOMINATION",
  "SI_RECEIVE",
  "VOYAGE_OPERATIONS",
] as const;

export type ExportBulkingStatus = (typeof EXPORT_BULKING_STATUSES)[number];

export const STATUS_TRANSITIONS: Record<ExportBulkingStatus, ExportBulkingStatus | null> = {
  SHIPMENT_PLANNING: "NOMINATION",
  NOMINATION: "SI_RECEIVE",
  SI_RECEIVE: "VOYAGE_OPERATIONS",
  VOYAGE_OPERATIONS: null,
};

export interface CreateExportBulkingShipmentDto {
  vessel_name: string;
  voyage_number: string;
  shipper: string;
  loadport_name: string;
  total_quantity: number;
  remarks?: string;
}

export interface UpdateExportBulkingShipmentDto {
  vessel_name?: string;
  voyage_number?: string;
  shipper?: string;
  loadport_name?: string;
  total_quantity?: number;
  received_nomination?: string;
  received_shipping_instruction?: string;
  incoterms?: string;
  laycan?: string;
  laycan_from?: string;
  laycan_to?: string;
  est_cargo_readiness?: string;
  est_cargo_readiness_period?: string;
  eta?: string;
  ata?: string;
  etb?: string;
  atb?: string;
  commence_loading?: string;
  etc?: string;
  atc?: string;
  td?: string;
  surveyor?: string;
  surveyor_reason?: string;
  agent?: string;
  laytime_rate_mtph?: number;
  demurrage_rate_pdpr?: number;
  remarks?: string;
}

export interface ListExportBulkingQuery {
  page?: number;
  limit?: number;
  search?: string;
  statuses?: string[];
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

export interface ExportBulkingShipmentRow {
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
  cargo_count?: number;
  cargo_summaries?: { item_description: string | null; destination_port: string | null }[] | null;
  si_numbers?: string[] | null;
  invoice_numbers?: string[] | null;
  pl_numbers?: string[] | null;
  invoice_line_summaries?: { contract_no: string | null; quantity: number | null; so_no: string | null }[] | null;
}

export interface CargoLineDto {
  id?: string;
  line_order?: number;
  cargo_name: string;
  quantity?: number;
  unit?: string;
  item_description?: string;
  destination_port?: string;
  destination_country?: string;
  country_area?: string;
}

export interface ShippingInstructionDto {
  id?: string;
  si_number?: string;
  messrs?: string;
  bill_of_lading_option?: string;
  consignee?: string;
  notify_party?: string;
  freight?: string;
  shipper_snapshot?: string;
  npwp?: string;
  bl_indicated?: string;
  lines?: SiLineDto[];
}

export interface SiLineDto {
  id?: string;
  cargo_line_id?: string;
  description_of_goods?: string;
  quantity?: number;
  bl_split_qty?: number;
  destination_port?: string;
}

export interface InvoiceDto {
  id?: string;
  invoice_no?: string;
  invoice_date?: string;
  messrs?: string;
  vessel_voyage_snapshot?: string;
  loadport_snapshot?: string;
  destination_snapshot?: string;
  marks?: string;
  /** When set on create/update, invoice is grouped under this SI (same shipment). */
  shipping_instruction_id?: string | null;
  /** Convenience: creates an initial invoice line tied to cargo when lines are omitted on create. */
  cargo_line_id?: string | null;
  lines?: InvoiceLineDto[];
}

export interface InvoiceLineDto {
  id?: string;
  cargo_line_id?: string;
  item_no?: number;
  description_of_goods?: string;
  contract_no?: string;
  so_no?: string;
  quantity?: number;
  unit_price?: number;
  total_amount?: number;
}

export interface PackingListDto {
  id?: string;
  packing_list_number?: string;
  loadport_snapshot?: string;
  destination_snapshot?: string;
  lines?: PackingListLineDto[];
}

export interface PackingListLineDto {
  id?: string;
  cargo_line_id?: string;
  description_of_goods?: string;
  quantity?: number;
  destination_snapshot?: string;
  packing?: string;
}
