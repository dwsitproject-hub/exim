/**
 * DHM (Data Hub Management) integration: company / site / plant + exchange_rate
 * master-data sync, webhook receiver, and inbound (create) support.
 */

export { DhmClient } from "./dhm-client.js";
export { createDhmClient, isDhmConfigured } from "./dhm-client-factory.js";
export { DhmApiError } from "./dhm-errors.js";
export { DhmSyncRepository } from "./dhm-sync.repository.js";
export { DhmSyncService } from "./dhm-sync.service.js";
export { DhmWebhookService, verifyDhmWebhookSignature } from "./dhm-webhook.service.js";
export { DhmInboundService } from "./dhm-inbound.service.js";
export {
  mapCompanyRecord,
  mapSiteRecord,
  mapPlantRecord,
  mapExchangeRateRecord,
  buildCompanyInboundPayload,
} from "./dhm-mapper.js";
export type { DhmCompanyRow, DhmSiteRow, DhmPlantRow, DhmExchangeRateRow } from "./dhm-mapper.js";
export type {
  DhmEntitySlug,
  DhmRecordEnvelope,
  DhmSyncPage,
  DhmLookupResult,
  DhmInboundResult,
  DhmInboundStatus,
  DhmWebhookEvent,
  DhmWebhookPayload,
  DhmCompanyData,
  DhmSiteData,
  DhmPlantData,
  DhmExchangeRateData,
  DhmErrorBody,
} from "./types.js";
export type { CreateCompanyInput, CreateCompanyOutcome } from "./dhm-inbound.service.js";
