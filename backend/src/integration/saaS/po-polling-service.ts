/**
 * PO polling service: runs every 5 minutes, calls external API, detects new PO, stores imported PO intake.
 * Notification to import users can be wired here (in-app or push).
 */

import { PoIntakeRepository } from "../../modules/po-intake/repositories/po-intake.repository.js";
import type { CreatePoIntakeDto, PoIntakeItemDto } from "../../modules/po-intake/dto/index.js";
import type { IPoApiClient, SaasPoResponse } from "./types.js";
import { logger } from "../../utils/logger.js";
import { PO_ITEM_UNIT_OPTION_SET } from "../../shared/po-item-units.js";

export interface PoPollingServiceOptions {
  intervalMs: number;
  poApiClient: IPoApiClient;
}

/** Same line rules as create-intake.validator (aligned with frontend Create PO). */
function saasItemsToValidLines(po: SaasPoResponse): PoIntakeItemDto[] | null {
  const raw = po.items ?? [];
  const out: PoIntakeItemDto[] = [];
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i]!;
    const desc = (it.item_description ?? "").trim();
    const qty = it.qty;
    const unit = (it.unit ?? "").trim();
    const value = it.value;
    if (
      !desc ||
      qty == null ||
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !unit ||
      !PO_ITEM_UNIT_OPTION_SET.has(unit) ||
      value == null ||
      !Number.isFinite(value) ||
      value < 0
    ) {
      continue;
    }
    out.push({
      line_number: out.length + 1,
      item_description: desc,
      qty,
      unit,
      value,
    });
  }
  return out.length > 0 ? out : null;
}

function toCreateDto(po: SaasPoResponse, items: PoIntakeItemDto[]): CreatePoIntakeDto {
  return {
    external_id: po.external_id,
    po_number: po.po_number,
    plant: po.plant,
    supplier_name: po.supplier_name,
    delivery_location: po.delivery_location,
    incoterm_location: po.incoterm_location,
    kawasan_berikat: po.kawasan_berikat,
    items,
  };
}

export async function runPoPollingCycle(
  repo: PoIntakeRepository,
  client: IPoApiClient
): Promise<{ ingested: number; duplicates: number }> {
  let ingested = 0;
  let duplicates = 0;

  try {
    const newPos = await client.fetchNewImportPos();
    for (const po of newPos) {
      try {
        const exists = await repo.existsByExternalId(po.external_id);
        if (exists) {
          duplicates += 1;
          continue;
        }
        const items = saasItemsToValidLines(po);
        if (!items) {
          logger.warn("Skipping SaaS PO: no valid line items", { external_id: po.external_id });
          continue;
        }
        const dto = toCreateDto(po, items);
        const row = await repo.create(dto, "NEW_PO_DETECTED");
        await repo.insertItems(row.id, dto.items);
        ingested += 1;
      } catch (err) {
        const msg = String(err);
        if (msg.includes("duplicate") || msg.includes("unique") || msg.includes("already exists")) {
          duplicates += 1;
        } else {
          logger.warn("PO ingestion failed", { external_id: po.external_id, error: msg });
        }
      }
    }
    if (ingested > 0) {
      logger.info("PO polling cycle completed", { ingested, duplicates });
    }
  } catch (err) {
    logger.error("PO polling cycle failed", { error: String(err) });
  }

  return { ingested, duplicates };
}

let pollingIntervalId: ReturnType<typeof setInterval> | null = null;

export function startPoPolling(repo: PoIntakeRepository, client: IPoApiClient, intervalMs: number): void {
  if (pollingIntervalId != null) {
    logger.warn("PO polling already started");
    return;
  }
  const run = () => runPoPollingCycle(repo, client);
  run();
  pollingIntervalId = setInterval(run, intervalMs);
  logger.info("PO polling started", { intervalMs });
}

export function stopPoPolling(): void {
  if (pollingIntervalId != null) {
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
    logger.info("PO polling stopped");
  }
}
