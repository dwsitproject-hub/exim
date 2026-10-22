/**
 * Local replica persistence for DHM company / site / plant / exchange_rate,
 * sync cursors, and webhook dedupe.
 */

import type { Pool } from "pg";
import { getPool } from "../../db/index.js";
import type { DhmCompanyRow, DhmExchangeRateRow, DhmPlantRow, DhmSiteRow } from "./dhm-mapper.js";

export interface DhmSyncStateRow {
  entity_type: string;
  cursor: string | null;
  last_synced_at: string | null;
  last_record_count: number;
  last_error: string | null;
}

export interface CompanyMasterMatchRow {
  id: string;
  name: string;
  country: string | null;
}

export interface PlantMasterMatchRow {
  id: string;
  name: string;
  plantCode: string | null;
  companyMasterId: string;
}

export interface MasterCatalogJoinRow {
  company_id: string;
  company_dhm_code: string;
  company_name: string;
  company_short_name: string | null;
  company_code_sap: string | null;
  company_country: string | null;
  company_is_active: boolean;
  site_id: string | null;
  site_dhm_code: string | null;
  site_name: string | null;
  site_address: string | null;
  site_is_active: boolean | null;
  plant_id: string | null;
  plant_dhm_code: string | null;
  plant_code: string | null;
  plant_name: string | null;
  plant_is_active: boolean | null;
}

export interface PtPlantTreeJoinRow {
  company_id: string;
  company_name: string;
  plant_id: string | null;
  plant_name: string | null;
  plant_code: string | null;
}

const COMPANY_SELECT = `id, dhm_id, dhm_code, name, short_name, company_code_sap, country, is_active,
              version, is_deleted, merged_into_code, raw_data, dhm_updated_at`;

export class DhmSyncRepository {
  private get pool(): Pool {
    return getPool();
  }

  // -- sync cursor -------------------------------------------------------

  async getSyncState(entityType: string): Promise<DhmSyncStateRow | null> {
    const { rows } = await this.pool.query<DhmSyncStateRow>(
      `SELECT entity_type, cursor, last_synced_at, last_record_count, last_error
       FROM dhm_sync_state WHERE entity_type = $1`,
      [entityType]
    );
    return rows[0] ?? null;
  }

  async saveSyncState(
    entityType: string,
    data: { cursor: string | null; recordCount: number; error?: string | null }
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO dhm_sync_state (entity_type, cursor, last_synced_at, last_record_count, last_error, updated_at)
       VALUES ($1, $2, NOW(), $3, $4, NOW())
       ON CONFLICT (entity_type) DO UPDATE SET
         cursor = EXCLUDED.cursor,
         last_synced_at = NOW(),
         last_record_count = EXCLUDED.last_record_count,
         last_error = EXCLUDED.last_error,
         updated_at = NOW()`,
      [entityType, data.cursor, data.recordCount, data.error ?? null]
    );
  }

  // -- webhook dedupe ------------------------------------------------------

  /** Returns true if this is the first time we have seen `deliveryId` (i.e. we should process it). */
  async recordWebhookDelivery(
    deliveryId: string,
    event: string,
    entityType: string | null,
    recordId: string | null
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `INSERT INTO dhm_webhook_deliveries (delivery_id, event, entity_type, record_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (delivery_id) DO NOTHING`,
      [deliveryId, event, entityType, recordId]
    );
    return (rowCount ?? 0) > 0;
  }

  // -- company -------------------------------------------------------------

  async upsertCompany(row: DhmCompanyRow): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO company_master (
         dhm_id, dhm_code, name, short_name, company_code_sap, country, is_active,
         version, is_deleted, merged_into_code, raw_data, dhm_updated_at, synced_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (dhm_id) DO UPDATE SET
         dhm_code = EXCLUDED.dhm_code,
         name = EXCLUDED.name,
         short_name = EXCLUDED.short_name,
         company_code_sap = EXCLUDED.company_code_sap,
         country = EXCLUDED.country,
         is_active = EXCLUDED.is_active,
         version = EXCLUDED.version,
         is_deleted = EXCLUDED.is_deleted,
         merged_into_code = EXCLUDED.merged_into_code,
         raw_data = EXCLUDED.raw_data,
         dhm_updated_at = EXCLUDED.dhm_updated_at,
         synced_at = NOW()
       WHERE company_master.version <= EXCLUDED.version
       RETURNING id`,
      [
        row.dhm_id,
        row.dhm_code,
        row.name,
        row.short_name,
        row.company_code_sap,
        row.country,
        row.is_active,
        row.version,
        row.is_deleted,
        row.merged_into_code,
        JSON.stringify(row.raw_data),
        row.dhm_updated_at,
      ]
    );
    return rows[0]?.id ?? null;
  }

  async searchCompanies(query: string, limit = 20): Promise<DhmCompanyRow[]> {
    const like = `%${query.trim().toLowerCase()}%`;
    const { rows } = await this.pool.query<DhmCompanyRow>(
      `SELECT ${COMPANY_SELECT}
       FROM company_master
       WHERE is_deleted = FALSE
         AND (lower(name) LIKE $1 OR lower(dhm_code) LIKE $1 OR lower(coalesce(short_name, '')) LIKE $1)
       ORDER BY name ASC
       LIMIT $2`,
      [like, limit]
    );
    return rows;
  }

  async listCompanies(limit = 50): Promise<DhmCompanyRow[]> {
    const { rows } = await this.pool.query<DhmCompanyRow>(
      `SELECT ${COMPANY_SELECT}
       FROM company_master WHERE is_deleted = FALSE ORDER BY name ASC LIMIT $1`,
      [limit]
    );
    return rows;
  }

  async findCompanyByCode(code: string): Promise<DhmCompanyRow | null> {
    const { rows } = await this.pool.query<DhmCompanyRow>(
      `SELECT ${COMPANY_SELECT}
       FROM company_master WHERE dhm_code = $1`,
      [code]
    );
    return rows[0] ?? null;
  }

  async findCompanyIdByDhmId(dhmId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id FROM company_master WHERE dhm_id = $1`,
      [dhmId]
    );
    return rows[0]?.id ?? null;
  }

  async listActiveCompaniesForMatch(): Promise<CompanyMasterMatchRow[]> {
    const { rows } = await this.pool.query<CompanyMasterMatchRow>(
      `SELECT id, name, country FROM company_master
       WHERE is_deleted = FALSE AND is_active = TRUE
       ORDER BY name ASC`
    );
    return rows;
  }

  async listMasterCatalogRows(): Promise<MasterCatalogJoinRow[]> {
    const { rows } = await this.pool.query<MasterCatalogJoinRow>(
      `SELECT
         c.id AS company_id,
         c.dhm_code AS company_dhm_code,
         c.name AS company_name,
         c.short_name AS company_short_name,
         c.company_code_sap AS company_code_sap,
         c.country AS company_country,
         c.is_active AS company_is_active,
         s.id AS site_id,
         s.dhm_code AS site_dhm_code,
         s.name AS site_name,
         s.address AS site_address,
         s.is_active AS site_is_active,
         p.id AS plant_id,
         p.dhm_code AS plant_dhm_code,
         p.plant_code AS plant_code,
         p.name AS plant_name,
         p.is_active AS plant_is_active
       FROM company_master c
       LEFT JOIN site_master s
         ON s.company_master_id = c.id AND s.is_deleted = FALSE
       LEFT JOIN plant_master p
         ON p.site_master_id = s.id AND p.is_deleted = FALSE
       WHERE c.is_deleted = FALSE
       ORDER BY c.name ASC, s.name ASC NULLS LAST, p.name ASC NULLS LAST`
    );
    return rows;
  }

  async listLatestExchangeRatesPerPair(limit = 50): Promise<DhmExchangeRateRow[]> {
    const { rows } = await this.pool.query<DhmExchangeRateRow>(
      `SELECT DISTINCT ON (from_currency, to_currency)
              id, code, name, from_currency, to_currency, rate, rate_date,
              from_decimals, to_decimals, coupa_id, coupa_updated_at, is_active,
              version, is_deleted, raw_data, dhm_updated_at
       FROM dhm_exchange_rates
       WHERE is_deleted = FALSE
       ORDER BY from_currency, to_currency, rate_date DESC
       LIMIT $1`,
      [limit]
    );
    return rows;
  }

  async listPtPlantTreeRows(): Promise<PtPlantTreeJoinRow[]> {
    const { rows } = await this.pool.query<PtPlantTreeJoinRow>(
      `SELECT c.id AS company_id, c.name AS company_name,
              s.id AS plant_id, s.name AS plant_name, NULL::varchar AS plant_code
       FROM company_master c
       LEFT JOIN site_master s
         ON s.company_master_id = c.id AND s.is_deleted = FALSE AND s.is_active = TRUE
       WHERE c.is_deleted = FALSE AND c.is_active = TRUE
       ORDER BY c.name ASC, s.name ASC NULLS LAST`
    );
    return rows;
  }

  async softDeleteCompanyById(dhmId: string, version: number, mergedIntoCode: string | null): Promise<void> {
    await this.pool.query(
      `UPDATE company_master SET is_deleted = TRUE, version = $2, merged_into_code = $3, synced_at = NOW()
       WHERE dhm_id = $1 AND version <= $2`,
      [dhmId, version, mergedIntoCode]
    );
  }

  // -- site ----------------------------------------------------------------

  /**
   * Upsert a site. Returns the EOS surrogate id, or null when the parent company
   * is not in company_master yet (out-of-order webhook — next full sync will retry).
   */
  async upsertSite(row: DhmSiteRow): Promise<string | null> {
    const companyMasterId = await this.findCompanyIdByDhmId(row.dhm_company_id);
    if (!companyMasterId) return null;

    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO site_master (
         dhm_id, dhm_code, company_master_id, name, address, is_active,
         version, is_deleted, raw_data, dhm_updated_at, synced_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (dhm_id) DO UPDATE SET
         dhm_code = EXCLUDED.dhm_code,
         company_master_id = EXCLUDED.company_master_id,
         name = EXCLUDED.name,
         address = EXCLUDED.address,
         is_active = EXCLUDED.is_active,
         version = EXCLUDED.version,
         is_deleted = EXCLUDED.is_deleted,
         raw_data = EXCLUDED.raw_data,
         dhm_updated_at = EXCLUDED.dhm_updated_at,
         synced_at = NOW()
       WHERE site_master.version <= EXCLUDED.version
       RETURNING id`,
      [
        row.dhm_id,
        row.dhm_code,
        companyMasterId,
        row.name,
        row.address,
        row.is_active,
        row.version,
        row.is_deleted,
        JSON.stringify(row.raw_data),
        row.dhm_updated_at,
      ]
    );
    return rows[0]?.id ?? null;
  }

  async findSiteByDhmId(dhmId: string): Promise<{ id: string; company_master_id: string } | null> {
    const { rows } = await this.pool.query<{ id: string; company_master_id: string }>(
      `SELECT id, company_master_id FROM site_master WHERE dhm_id = $1`,
      [dhmId]
    );
    return rows[0] ?? null;
  }

  async softDeleteSiteByDhmId(dhmId: string, version: number): Promise<void> {
    await this.pool.query(
      `UPDATE site_master SET is_deleted = TRUE, version = $2, synced_at = NOW()
       WHERE dhm_id = $1 AND version <= $2`,
      [dhmId, version]
    );
  }

  // -- plant ---------------------------------------------------------------

  /**
   * Upsert a plant. Returns the EOS surrogate id, or null when the parent site
   * is not in site_master yet (out-of-order webhook — next full sync will retry).
   */
  async upsertPlant(row: DhmPlantRow): Promise<string | null> {
    const site = await this.findSiteByDhmId(row.dhm_site_id);
    if (!site) return null;

    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO plant_master (
         dhm_id, dhm_code, site_master_id, company_master_id, plant_code, name, is_active,
         version, is_deleted, raw_data, dhm_updated_at, synced_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
       ON CONFLICT (dhm_id) DO UPDATE SET
         dhm_code = EXCLUDED.dhm_code,
         site_master_id = EXCLUDED.site_master_id,
         company_master_id = EXCLUDED.company_master_id,
         plant_code = EXCLUDED.plant_code,
         name = EXCLUDED.name,
         is_active = EXCLUDED.is_active,
         version = EXCLUDED.version,
         is_deleted = EXCLUDED.is_deleted,
         raw_data = EXCLUDED.raw_data,
         dhm_updated_at = EXCLUDED.dhm_updated_at,
         synced_at = NOW()
       WHERE plant_master.version <= EXCLUDED.version
       RETURNING id`,
      [
        row.dhm_id,
        row.dhm_code,
        site.id,
        site.company_master_id,
        row.plant_code,
        row.name,
        row.is_active,
        row.version,
        row.is_deleted,
        JSON.stringify(row.raw_data),
        row.dhm_updated_at,
      ]
    );
    return rows[0]?.id ?? null;
  }

  /**
   * Sites used as the Plant snapshot/dropdown, plus child plant_code so Syncera
   * codes (e.g. EU72) still resolve to the parent site name.
   */
  async listActivePlantsForMatch(): Promise<PlantMasterMatchRow[]> {
    const { rows } = await this.pool.query<PlantMasterMatchRow>(
      `SELECT s.id, s.name, p.plant_code AS "plantCode", s.company_master_id AS "companyMasterId"
       FROM site_master s
       LEFT JOIN plant_master p
         ON p.site_master_id = s.id AND p.is_deleted = FALSE AND p.is_active = TRUE
       WHERE s.is_deleted = FALSE AND s.is_active = TRUE
       ORDER BY s.name ASC`
    );
    return rows;
  }

  async softDeletePlantByDhmId(dhmId: string, version: number): Promise<void> {
    await this.pool.query(
      `UPDATE plant_master SET is_deleted = TRUE, version = $2, synced_at = NOW()
       WHERE dhm_id = $1 AND version <= $2`,
      [dhmId, version]
    );
  }

  // -- exchange rate ---------------------------------------------------------

  async upsertExchangeRate(row: DhmExchangeRateRow): Promise<void> {
    await this.pool.query(
      `INSERT INTO dhm_exchange_rates (
         id, code, name, from_currency, to_currency, rate, rate_date,
         from_decimals, to_decimals, coupa_id, coupa_updated_at, is_active,
         version, is_deleted, raw_data, dhm_updated_at, synced_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         name = EXCLUDED.name,
         from_currency = EXCLUDED.from_currency,
         to_currency = EXCLUDED.to_currency,
         rate = EXCLUDED.rate,
         rate_date = EXCLUDED.rate_date,
         from_decimals = EXCLUDED.from_decimals,
         to_decimals = EXCLUDED.to_decimals,
         coupa_id = EXCLUDED.coupa_id,
         coupa_updated_at = EXCLUDED.coupa_updated_at,
         is_active = EXCLUDED.is_active,
         version = EXCLUDED.version,
         is_deleted = EXCLUDED.is_deleted,
         raw_data = EXCLUDED.raw_data,
         dhm_updated_at = EXCLUDED.dhm_updated_at,
         synced_at = NOW()
       WHERE dhm_exchange_rates.version <= EXCLUDED.version`,
      [
        row.id,
        row.code,
        row.name,
        row.from_currency,
        row.to_currency,
        row.rate,
        row.rate_date,
        row.from_decimals,
        row.to_decimals,
        row.coupa_id,
        row.coupa_updated_at,
        row.is_active,
        row.version,
        row.is_deleted,
        JSON.stringify(row.raw_data),
        row.dhm_updated_at,
      ]
    );
  }

  async softDeleteExchangeRateById(id: string, version: number): Promise<void> {
    await this.pool.query(
      `UPDATE dhm_exchange_rates SET is_deleted = TRUE, version = $2, synced_at = NOW()
       WHERE id = $1 AND version <= $2`,
      [id, version]
    );
  }

  /** Latest active rate for a currency pair on or before `onOrBeforeDate` (YYYY-MM-DD). */
  async findLatestExchangeRate(
    fromCurrency: string,
    toCurrency: string,
    onOrBeforeDate: string
  ): Promise<DhmExchangeRateRow | null> {
    const { rows } = await this.pool.query<DhmExchangeRateRow>(
      `SELECT id, code, name, from_currency, to_currency, rate, rate_date,
              from_decimals, to_decimals, coupa_id, coupa_updated_at, is_active,
              version, is_deleted, raw_data, dhm_updated_at
       FROM dhm_exchange_rates
       WHERE is_deleted = FALSE AND from_currency = $1 AND to_currency = $2 AND rate_date <= $3
       ORDER BY rate_date DESC
       LIMIT 1`,
      [fromCurrency.toUpperCase(), toCurrency.toUpperCase(), onOrBeforeDate]
    );
    return rows[0] ?? null;
  }
}
