/**
 * DHM snapshot + incremental sync for company / site / plant / exchange_rate
 * (§6 of CLIENT_INTEGRATION.md). Pages via `/v1/sync/:entityType`, persists the cursor
 * so restarts resume mid-sync, and applies single-record updates pushed by the webhook
 * receiver via `applyRecord`. Parents are synced before children.
 */

import { logger } from "../../utils/logger.js";
import type { DhmClient } from "./dhm-client.js";
import { mapCompanyRecord, mapExchangeRateRecord, mapPlantRecord, mapSiteRecord } from "./dhm-mapper.js";
import { DhmSyncRepository } from "./dhm-sync.repository.js";
import type { DhmEntitySlug, DhmRecordEnvelope } from "./types.js";
import { DhmApiError } from "./dhm-errors.js";

const SYNC_ORDER: readonly DhmEntitySlug[] = ["company", "site", "plant", "exchange_rate"];

export interface DhmSyncMetrics {
  entityType: DhmEntitySlug;
  pages: number;
  records: number;
  cursor: string | null;
}

export class DhmSyncService {
  constructor(
    private readonly client: DhmClient,
    private readonly repo: DhmSyncRepository = new DhmSyncRepository(),
    private readonly pageLimit = 200
  ) {}

  /** Snapshot + incremental sync for one entity. Resumes from the last saved cursor, if any. */
  async syncEntity(slug: DhmEntitySlug): Promise<DhmSyncMetrics> {
    const state = await this.repo.getSyncState(slug);
    let cursor = state?.cursor ?? undefined;
    const updatedSince = cursor ? undefined : state?.last_synced_at ?? undefined;
    let pages = 0;
    let total = 0;

    try {
      for (;;) {
        const page = await this.client.syncPage(slug, {
          cursor,
          updatedSince,
          limit: this.pageLimit,
          includeDeleted: true,
        });
        pages += 1;
        for (const record of page.records) {
          await this.applyRecord(slug, record);
          total += 1;
        }
        cursor = page.nextCursor ?? cursor;
        if (!page.hasMore) break;
        if (!page.nextCursor) break;
      }
      await this.repo.saveSyncState(slug, { cursor: cursor ?? null, recordCount: total });
      logger.info("DHM sync completed", { entityType: slug, pages, records: total });
      return { entityType: slug, pages, records: total, cursor: cursor ?? null };
    } catch (err) {
      const message = err instanceof DhmApiError ? `${err.code}: ${err.message}` : String(err);
      await this.repo.saveSyncState(slug, { cursor: cursor ?? null, recordCount: total, error: message });
      logger.error("DHM sync failed", { entityType: slug, error: message });
      throw err;
    }
  }

  async syncAll(): Promise<DhmSyncMetrics[]> {
    const results: DhmSyncMetrics[] = [];
    for (const slug of SYNC_ORDER) {
      try {
        results.push(await this.syncEntity(slug));
      } catch {
        // Already logged in syncEntity; continue so one failing entity does not block the others.
      }
    }
    return results;
  }

  /** Apply a single record (from a sync page or a webhook) to the local replica. */
  async applyRecord(slug: DhmEntitySlug, record: DhmRecordEnvelope): Promise<void> {
    if (slug === "company") {
      const row = mapCompanyRecord(record);
      if (row.is_deleted) {
        await this.repo.softDeleteCompanyById(row.dhm_id, row.version, row.merged_into_code);
      } else {
        await this.repo.upsertCompany(row);
      }
      return;
    }

    if (slug === "site") {
      const row = mapSiteRecord(record);
      if (row.is_deleted) {
        await this.repo.softDeleteSiteByDhmId(row.dhm_id, row.version);
        return;
      }
      const id = await this.repo.upsertSite(row);
      if (!id) {
        logger.warn("DHM site skipped: parent company not in company_master yet", {
          dhmId: row.dhm_id,
          dhmCompanyId: row.dhm_company_id,
        });
      }
      return;
    }

    if (slug === "plant") {
      const row = mapPlantRecord(record);
      if (row.is_deleted) {
        await this.repo.softDeletePlantByDhmId(row.dhm_id, row.version);
        return;
      }
      const id = await this.repo.upsertPlant(row);
      if (!id) {
        logger.warn("DHM plant skipped: parent site not in site_master yet", {
          dhmId: row.dhm_id,
          dhmSiteId: row.dhm_site_id,
        });
      }
      return;
    }

    const row = mapExchangeRateRecord(record);
    if (row.is_deleted) {
      await this.repo.softDeleteExchangeRateById(row.id, row.version);
    } else {
      await this.repo.upsertExchangeRate(row);
    }
  }
}
