/**
 * Master-data service: reads from the local DHM replica; writes (company create) go through DHM.
 */

import { randomUUID } from "crypto";
import { AppError } from "../../../middlewares/errorHandler.js";
import type { DhmInboundService } from "../../../integration/dhm/dhm-inbound.service.js";
import { DhmSyncRepository, type DhmSyncStateRow } from "../../../integration/dhm/dhm-sync.repository.js";
import type { DhmSyncService } from "../../../integration/dhm/dhm-sync.service.js";
import { DhmApiError } from "../../../integration/dhm/dhm-errors.js";
import { getDhmServices } from "../../../integration/dhm/dhm-registry.js";
import type {
  CompanySummaryDto,
  CreateCompanyDto,
  ExchangeRateLookupDto,
  MasterCatalogCompanyDto,
  MasterCatalogDto,
  PtPlantTreeNodeDto,
} from "../dto/index.js";
import type { DhmCompanyRow } from "../../../integration/dhm/dhm-mapper.js";
import type { DhmEntitySlug } from "../../../integration/dhm/types.js";

function toCompanySummary(row: DhmCompanyRow): CompanySummaryDto {
  return {
    id: row.id,
    code: row.dhm_code,
    name: row.name,
    short_name: row.short_name,
    company_code_sap: row.company_code_sap,
    country: row.country,
    is_active: row.is_active,
  };
}

export class MastersService {
  constructor(
    private readonly repo: DhmSyncRepository = new DhmSyncRepository(),
    private readonly inboundServiceOverride?: DhmInboundService,
    private readonly syncServiceOverride?: DhmSyncService
  ) {}

  /** Resolved lazily (not at construction) so module-load-time singletons still pick up the
   * registry once `src/index.ts` enables DHM and calls `setDhmServices`. */
  private get inboundService(): DhmInboundService | undefined {
    return this.inboundServiceOverride ?? getDhmServices()?.inboundService;
  }

  private get syncService(): DhmSyncService | undefined {
    return this.syncServiceOverride ?? getDhmServices()?.syncService;
  }

  async searchCompanies(query: string, limit = 20): Promise<CompanySummaryDto[]> {
    const rows = query.trim() ? await this.repo.searchCompanies(query, limit) : await this.repo.listCompanies(limit);
    return rows.map(toCompanySummary);
  }

  /** Active companies with their active sites — drives PT / Plant dropdowns (Plant = site name). */
  async getPtPlantTree(): Promise<PtPlantTreeNodeDto[]> {
    const rows = await this.repo.listPtPlantTreeRows();
    const byCompany = new Map<string, PtPlantTreeNodeDto>();
    for (const row of rows) {
      let node = byCompany.get(row.company_id);
      if (!node) {
        node = { id: row.company_id, name: row.company_name, plants: [] };
        byCompany.set(row.company_id, node);
      }
      if (row.plant_id && row.plant_name) {
        node.plants.push({
          id: row.plant_id,
          name: row.plant_name,
          plantCode: row.plant_code,
        });
      }
    }
    return [...byCompany.values()];
  }

  /** Full company → site → plant catalog for the master-data screen. */
  async getCatalog(): Promise<MasterCatalogDto> {
    const [rows, rates] = await Promise.all([
      this.repo.listMasterCatalogRows(),
      this.repo.listLatestExchangeRatesPerPair(50),
    ]);
    const companies = new Map<string, MasterCatalogCompanyDto>();
    for (const row of rows) {
      let company = companies.get(row.company_id);
      if (!company) {
        company = {
          id: row.company_id,
          dhm_code: row.company_dhm_code,
          name: row.company_name,
          short_name: row.company_short_name,
          company_code_sap: row.company_code_sap,
          country: row.company_country,
          is_active: row.company_is_active,
          sites: [],
        };
        companies.set(row.company_id, company);
      }
      if (!row.site_id || !row.site_name) continue;
      let site = company.sites.find((s) => s.id === row.site_id);
      if (!site) {
        site = {
          id: row.site_id,
          dhm_code: row.site_dhm_code ?? "",
          name: row.site_name,
          address: row.site_address,
          is_active: row.site_is_active !== false,
          plants: [],
        };
        company.sites.push(site);
      }
      if (row.plant_id && row.plant_name) {
        site.plants.push({
          id: row.plant_id,
          dhm_code: row.plant_dhm_code ?? "",
          plant_code: row.plant_code,
          name: row.plant_name,
          is_active: row.plant_is_active !== false,
        });
      }
    }
    return {
      companies: [...companies.values()],
      exchange_rates: rates.map((row) => ({
        code: row.code,
        from_currency: row.from_currency,
        to_currency: row.to_currency,
        rate: row.rate,
        rate_date: row.rate_date,
      })),
    };
  }

  /** Create a new company directly in DHM (pattern A). Requires DHM_ENABLED + credentials. */
  async createCompany(
    input: CreateCompanyDto,
    opts: { userId?: string | null; idempotencyKey?: string }
  ): Promise<{ status: string; code?: string; name: string; pendingReview: boolean; message?: string }> {
    if (!this.inboundService) {
      throw new AppError(
        "DHM integration is not enabled on this environment. Set DHM_ENABLED=true and the key pair to create companies.",
        503
      );
    }
    try {
      const result = await this.inboundService.createCompany(input, {
        idempotencyKey: opts.idempotencyKey ?? randomUUID(),
        submittedByUserId: opts.userId ?? null,
      });
      return {
        status: result.status,
        code: result.code,
        name: result.name ?? input.name,
        pendingReview: result.pendingReview,
        message: result.message,
      };
    } catch (err) {
      if (err instanceof DhmApiError) {
        throw new AppError(err.message, err.httpStatus >= 400 && err.httpStatus < 500 ? err.httpStatus : 502, [
          { field: err.body?.field ? String(err.body.field) : "name", message: err.message },
        ]);
      }
      throw err;
    }
  }

  async getLatestExchangeRate(from: string, to: string, onOrBeforeDate: string): Promise<ExchangeRateLookupDto | null> {
    const row = await this.repo.findLatestExchangeRate(from, to, onOrBeforeDate);
    if (!row) return null;
    return {
      code: row.code,
      from_currency: row.from_currency,
      to_currency: row.to_currency,
      rate: row.rate,
      rate_date: row.rate_date,
    };
  }

  async triggerSync(entityType?: DhmEntitySlug): Promise<void> {
    if (!this.syncService) {
      throw new AppError("DHM integration is not enabled on this environment.", 503);
    }
    if (entityType) {
      await this.syncService.syncEntity(entityType);
    } else {
      await this.syncService.syncAll();
    }
  }

  async getSyncHealth(): Promise<DhmSyncStateRow[]> {
    const slugs = ["company", "site", "plant", "exchange_rate"] as const;
    const rows = await Promise.all(slugs.map((slug) => this.repo.getSyncState(slug)));
    return rows.filter((s): s is DhmSyncStateRow => s !== null);
  }
}
