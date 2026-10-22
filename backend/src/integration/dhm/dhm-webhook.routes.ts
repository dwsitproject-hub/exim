/**
 * DHM webhook route. No EOS auth middleware — DHM authenticates via HMAC signature instead
 * (§10 Webhooks). Must be mounted with express.raw() so the handler can verify the exact bytes.
 */

import { Router } from "express";
import { handleDhmWebhook } from "./dhm-webhook.controller.js";

export const dhmWebhookRoutes = Router();
dhmWebhookRoutes.post("/", handleDhmWebhook);
