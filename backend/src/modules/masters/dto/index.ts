/**
 * DHM-backed master-data DTOs exposed to the EOS frontend
 * (company / site / plant tree + exchange_rate).
 */

export interface CompanySummaryDto {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  company_code_sap: string | null;
  country: string | null;
  is_active: boolean;
}

export interface CreateCompanyDto {
  name: string;
  short_name?: string;
  company_code_sap?: string;
  country?: string;
  is_active?: boolean;
}

/** One site shown in the Plant dropdown (snapshot stored on import_purchase_order.plant). */
export interface PtPlantTreePlantDto {
  id: string;
  name: string;
  plantCode: string | null;
}

export interface PtPlantTreeNodeDto {
  id: string;
  name: string;
  plants: PtPlantTreePlantDto[];
}

export interface MasterCatalogPlantDto {
  id: string;
  dhm_code: string;
  plant_code: string | null;
  name: string;
  is_active: boolean;
}

export interface MasterCatalogSiteDto {
  id: string;
  dhm_code: string;
  name: string;
  address: string | null;
  is_active: boolean;
  plants: MasterCatalogPlantDto[];
}

export interface MasterCatalogCompanyDto {
  id: string;
  dhm_code: string;
  name: string;
  short_name: string | null;
  company_code_sap: string | null;
  country: string | null;
  is_active: boolean;
  sites: MasterCatalogSiteDto[];
}

export interface MasterCatalogDto {
  companies: MasterCatalogCompanyDto[];
  exchange_rates: ExchangeRateLookupDto[];
}

export interface ExchangeRateLookupDto {
  code: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
}

export interface DhmSyncHealthDto {
  entity_type: string;
  cursor: string | null;
  last_synced_at: string | null;
  last_record_count: number;
  last_error: string | null;
}
