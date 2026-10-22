/**
 * Process-wide handle to the DHM client/services, set once at bootstrap when DHM_ENABLED=true.
 * Lets controllers (masters module, webhook route) reach the configured instances without
 * re-reading env or risking import cycles with src/index.ts.
 */

import type { DhmClient } from "./dhm-client.js";
import type { DhmSyncService } from "./dhm-sync.service.js";
import type { DhmWebhookService } from "./dhm-webhook.service.js";
import type { DhmInboundService } from "./dhm-inbound.service.js";

export interface DhmServices {
  client: DhmClient;
  syncService: DhmSyncService;
  webhookService: DhmWebhookService;
  inboundService: DhmInboundService;
}

let services: DhmServices | null = null;

export function setDhmServices(next: DhmServices | null): void {
  services = next;
}

export function getDhmServices(): DhmServices | null {
  return services;
}
