/**
 * Map DHM company / site / plant / exchange_rate record envelopes <-> EOS local replica rows.
 * DHM REFERENCE fields (`site.company_id`, `plant.site_id`) are the target row's UUID, not its code.
 */

import type { DhmRecordEnvelope } from "./types.js";

export interface DhmCompanyRow {
  /** EOS surrogate id — present on rows loaded from company_master; mapper leaves this as dhm_id. */
  id: string;
  dhm_id: string;
  dhm_code: string;
  name: string;
  short_name: string | null;
  company_code_sap: string | null;
  country: string | null;
  is_active: boolean;
  version: number;
  is_deleted: boolean;
  merged_into_code: string | null;
  raw_data: Record<string, unknown>;
  dhm_updated_at: string;
}

export interface DhmSiteRow {
  dhm_id: string;
  dhm_code: string;
  /** DHM UUID of the parent company — resolved to company_master.id via dhm_id. */
  dhm_company_id: string;
  name: string;
  address: string | null;
  is_active: boolean;
  version: number;
  is_deleted: boolean;
  raw_data: Record<string, unknown>;
  dhm_updated_at: string;
}

export interface DhmPlantRow {
  dhm_id: string;
  dhm_code: string;
  /** DHM UUID of the parent site — resolved to site_master.id via dhm_id. */
  dhm_site_id: string;
  plant_code: string | null;
  name: string;
  is_active: boolean;
  version: number;
  is_deleted: boolean;
  raw_data: Record<string, unknown>;
  dhm_updated_at: string;
}

export interface DhmExchangeRateRow {
  id: string;
  code: string;
  name: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
  from_decimals: number | null;
  to_decimals: number | null;
  coupa_id: string | null;
  coupa_updated_at: string | null;
  is_active: boolean;
  version: number;
  is_deleted: boolean;
  raw_data: Record<string, unknown>;
  dhm_updated_at: string;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function mapCompanyRecord(record: DhmRecordEnvelope, mergedIntoCode?: string | null): DhmCompanyRow {
  const data = record.data as Record<string, unknown>;
  return {
    id: record.id,
    dhm_id: record.id,
    dhm_code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    short_name: str(data.short_name),
    company_code_sap: str(data.company_code_sap),
    country: str(data.country),
    is_active: data.is_active !== false,
    version: record.version,
    is_deleted: record.isDeleted,
    merged_into_code: mergedIntoCode ?? record.mergedInto?.code ?? null,
    raw_data: data,
    dhm_updated_at: record.updatedAt,
  };
}

export function mapSiteRecord(record: DhmRecordEnvelope): DhmSiteRow {
  const data = record.data as Record<string, unknown>;
  return {
    dhm_id: record.id,
    dhm_code: String(data.code ?? ""),
    dhm_company_id: String(data.company_id ?? ""),
    name: String(data.name ?? ""),
    address: str(data.address),
    is_active: data.is_active !== false,
    version: record.version,
    is_deleted: record.isDeleted,
    raw_data: data,
    dhm_updated_at: record.updatedAt,
  };
}

export function mapPlantRecord(record: DhmRecordEnvelope): DhmPlantRow {
  const data = record.data as Record<string, unknown>;
  return {
    dhm_id: record.id,
    dhm_code: String(data.code ?? ""),
    dhm_site_id: String(data.site_id ?? ""),
    plant_code: str(data.plant_code),
    name: String(data.name ?? ""),
    is_active: data.is_active !== false,
    version: record.version,
    is_deleted: record.isDeleted,
    raw_data: data,
    dhm_updated_at: record.updatedAt,
  };
}

export function mapExchangeRateRecord(record: DhmRecordEnvelope): DhmExchangeRateRow {
  const data = record.data as Record<string, unknown>;
  return {
    id: record.id,
    code: String(data.code ?? ""),
    name: String(data.name ?? ""),
    from_currency: String(data.from_currency ?? "").toUpperCase(),
    to_currency: String(data.to_currency ?? "").toUpperCase(),
    rate: num(data.rate) ?? 0,
    rate_date: String(data.rate_date ?? "").slice(0, 10),
    from_decimals: num(data.from_decimals),
    to_decimals: num(data.to_decimals),
    coupa_id: str(data.coupa_id),
    coupa_updated_at: str(data.coupa_updated_at),
    is_active: data.is_active !== false,
    version: record.version,
    is_deleted: record.isDeleted,
    raw_data: data,
    dhm_updated_at: record.updatedAt,
  };
}

/** Build the inbound POST/PUT payload for a new/updated company. DHM assigns `code`; omit it on create. */
export function buildCompanyInboundPayload(input: {
  name: string;
  short_name?: string | null;
  company_code_sap?: string | null;
  country?: string | null;
  is_active?: boolean;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: input.name.trim() };
  if (input.short_name) payload.short_name = input.short_name.trim();
  if (input.company_code_sap) payload.company_code_sap = input.company_code_sap.trim();
  if (input.country) payload.country = input.country.trim();
  if (input.is_active !== undefined) payload.is_active = input.is_active;
  return payload;
}
