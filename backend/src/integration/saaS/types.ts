/**
 * SaaS PO API types. Abstracted for external API or mock.
 * Rule: 1 PO = multiple items, 1 incoterm. Final PO data: Plant, PO Number, Supplier name, Items (Qty, Unit, Value), Incoterms.
 */

export interface SaasPoItem {
  item_description?: string;
  qty?: number;
  unit?: string;
  value?: number;
}

export interface SaasPoResponse {
  external_id: string;
  po_number: string;
  plant?: string;
  pt?: string;
  supplier_name: string;
  delivery_location?: string;
  incoterm_location?: string;
  kawasan_berikat?: string;
  currency?: string;
  items?: SaasPoItem[];
  /** SHA-256 hex of normalized mapped payload; set by Syncera mapper. */
  fingerprint?: string;
}

/** Flat line as returned by Syncera GET /po-import. */
export interface SynceraPoLine {
  pt_code?: string;
  pt_name?: string;
  plant_code?: string;
  plant_name?: string;
  po_number?: string;
  supplier_name?: string;
  delivery_location?: string;
  incoterm?: string;
  currency?: string;
  kawasan_berikat?: string;
  item_description?: string;
  qty_item?: number;
  unit?: string;
  price_per_unit?: number;
}

export interface SynceraMapSkip {
  po_number: string;
  pt_code: string;
  external_id: string;
  reason: "NO_VALID_LINE_ITEMS" | "SUPPLIER_NAME_MISSING";
  message: string;
}

export interface MapSynceraLinesResult {
  mapped: SaasPoResponse[];
  skipped: SynceraMapSkip[];
}

export interface PoImportFetchResult {
  mapped: SaasPoResponse[];
  dateFrom?: string;
  dateTo?: string;
  rawLineCount: number;
  skippedAtMap: SynceraMapSkip[];
}

export interface IPoApiClient {
  /** Fetch new Import POs since last sync. Implementation may use cursor/timestamp. */
  fetchNewImportPos(): Promise<SaasPoResponse[]>;
  /** Full fetch with Syncera poll window metadata when available. */
  fetchImportBatch(): Promise<PoImportFetchResult>;
}
