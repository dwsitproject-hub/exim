/**
 * DHM-backed master-data types (company / site / plant + exchange_rate).
 */

export interface CompanyMasterSummary {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  company_code_sap: string | null;
  country: string | null;
  is_active: boolean;
}

export interface CreateCompanyInput {
  name: string;
  short_name?: string;
  company_code_sap?: string;
  country?: string;
  is_active?: boolean;
}

export interface CreateCompanyResult {
  status: "created" | "updated" | "unchanged" | "pending_review" | "duplicate";
  code?: string;
  name: string;
  pendingReview: boolean;
  message?: string;
}

/** Site shown in the Plant dropdown; name is snapshotted onto import_purchase_order.plant. */
export interface PtPlantTreePlant {
  id: string;
  name: string;
  plantCode: string | null;
}

export interface PtPlantTreeNode {
  id: string;
  name: string;
  plants: PtPlantTreePlant[];
}

export interface MasterCatalogPlant {
  id: string;
  dhm_code: string;
  plant_code: string | null;
  name: string;
  is_active: boolean;
}

export interface MasterCatalogSite {
  id: string;
  dhm_code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  plants: MasterCatalogPlant[];
}

export interface MasterCatalogCompany {
  id: string;
  dhm_code: string;
  name: string;
  short_name: string | null;
  company_code_sap: string | null;
  country: string | null;
  is_active: boolean;
  sites: MasterCatalogSite[];
}

export interface MasterCatalog {
  companies: MasterCatalogCompany[];
  exchange_rates: ExchangeRateLookupResult[];
}

export interface ExchangeRateLookupResult {
  code: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
}

export interface DhmSyncHealth {
  entity_type: string;
  cursor: string | null;
  last_synced_at: string | null;
  last_record_count: number;
  last_error: string | null;
}
