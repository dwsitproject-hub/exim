/**
 * DHM webhook receiver. DHM is the active side — verify the signature on the raw body, ack fast
 * (<3s timeout per §10), then apply asynchronously. Mounted with express.raw() (see app/index.ts)
 * so `req.body` is the raw Buffer, not pre-parsed JSON.
 */

import type { Request, Response } from "express";
import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import { getDhmServices } from "./dhm-registry.js";
import { verifyDhmWebhookSignature } from "./dhm-webhook.service.js";
import type { DhmWebhookPayload } from "./types.js";

export async function handleDhmWebhook(req: Request, res: Response): Promise<void> {
  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));

  const verification = verifyDhmWebhookSignature({
    rawBody,
    signatureHeader: req.header("X-DHM-Signature-256"),
    secret: config.dhm.webhookSecret,
    toleranceSeconds: config.dhm.webhookToleranceSeconds,
  });
  if (!verification.ok) {
    logger.warn("DHM webhook rejected", { reason: verification.reason });
    res.status(401).json({ error: verification.reason });
    return;
  }

  let payload: DhmWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as DhmWebhookPayload;
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  // Ack immediately; DHM's timeout is 3s and retries on non-2xx. Apply the record after responding.
  res.status(200).json({ received: true });

  const services = getDhmServices();
  if (!services) {
    logger.warn("DHM webhook received but DHM integration is not enabled; dropping", {
      deliveryId: payload.deliveryId,
    });
    return;
  }

  try {
    await services.webhookService.handleEvent(payload);
  } catch (err) {
    logger.error("DHM webhook processing failed", {
      deliveryId: payload.deliveryId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
