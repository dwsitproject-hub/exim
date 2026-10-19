/**
 * DHM webhook receiver: verify `X-DHM-Signature-256` on the raw body, reject stale timestamps
 * (replay protection), dedupe on `X-DHM-Delivery-Id`, then apply the record to the local replica.
 * See §10 Webhooks of CLIENT_INTEGRATION.md.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { logger } from "../../utils/logger.js";
import { DhmSyncService } from "./dhm-sync.service.js";
import { DhmSyncRepository } from "./dhm-sync.repository.js";
import type { DhmEntitySlug, DhmWebhookPayload } from "./types.js";

const SUPPORTED_ENTITIES: readonly string[] = ["company", "site", "plant", "exchange_rate"];

export interface VerifySignatureOptions {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  secret: string;
  toleranceSeconds: number;
  now?: number;
}

export type VerifyResult = { ok: true } | { ok: false; reason: string };

/** Verify `X-DHM-Signature-256: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. */
export function verifyDhmWebhookSignature(opts: VerifySignatureOptions): VerifyResult {
  if (!opts.secret) return { ok: false, reason: "Webhook secret not configured" };
  if (!opts.signatureHeader) return { ok: false, reason: "Missing X-DHM-Signature-256 header" };

  const parts = Object.fromEntries(
    opts.signatureHeader.split(",").map((part) => {
      const [k, v] = part.split("=");
      return [k?.trim(), v?.trim()] as const;
    })
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false, reason: "Malformed signature header" };

  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000);
  const tSeconds = Number(t);
  if (!Number.isFinite(tSeconds) || Math.abs(nowSeconds - tSeconds) > opts.toleranceSeconds) {
    return { ok: false, reason: "Signature timestamp outside tolerance window" };
  }

  const expected = createHmac("sha256", opts.secret).update(`${t}.${opts.rawBody.toString("utf8")}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(v1, "hex");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
    return { ok: false, reason: "Signature mismatch" };
  }
  return { ok: true };
}

export class DhmWebhookService {
  constructor(
    private readonly syncService: DhmSyncService,
    private readonly repo: DhmSyncRepository = new DhmSyncRepository()
  ) {}

  /** Returns true if the event was applied; false if it was skipped (unsupported entity / dup). */
  async handleEvent(payload: DhmWebhookPayload): Promise<boolean> {
    if (!SUPPORTED_ENTITIES.includes(payload.entityType)) {
      logger.debug("DHM webhook ignored: unsupported entityType", { entityType: payload.entityType });
      return false;
    }

    const isNew = await this.repo.recordWebhookDelivery(
      payload.deliveryId,
      payload.event,
      payload.entityType,
      payload.recordId
    );
    if (!isNew) {
      logger.info("DHM webhook delivery already processed (dedup)", { deliveryId: payload.deliveryId });
      return false;
    }

    const slug = payload.entityType as DhmEntitySlug;
    const isDeleted = payload.event === "record.deleted";

    await this.syncService.applyRecord(slug, {
      id: payload.recordId,
      version: payload.version,
      isDeleted,
      data: payload.data,
      updatedAt: payload.occurredAt,
      mergedInto: payload.mergedInto,
    });

    logger.info("DHM webhook applied", {
      event: payload.event,
      entityType: payload.entityType,
      recordId: payload.recordId,
      deliveryId: payload.deliveryId,
    });
    return true;
  }
}
