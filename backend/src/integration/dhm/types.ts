/**
 * DHM (Data Hub Management) client types.
 * Contract: GET {DHM_API}/openapi.json. See Docs/CLIENT_INTEGRATION.md in the DHM repo.
 * EOS integrates `company`, `site`, `plant` (internal Company → Site → Plant) and
 * `exchange_rate` (read-only, synced by DHM from Coupa).
 */

export type DhmEntitySlug = "company" | "site" | "plant" | "exchange_rate";

/** Raw DHM sync/lookup record envelope: `{ id, version, isDeleted, data, updatedAt }`. */
export interface DhmRecordEnvelope<T = Record<string, unknown>> {
  id: string;
  version: number;
  isDeleted: boolean;
  data: T;
  updatedAt: string;
  /** Present only on GET /v1/sync/:entityType/:id for a retired (merged) record. */
  mergedInto?: { id: string; code: string };
}

export interface DhmSyncPage<T = Record<string, unknown>> {
  entityType: string;
  limit: number;
  count: number;
  hasMore: boolean;
  nextCursor: string | null;
  records: DhmRecordEnvelope<T>[];
}

export interface DhmLookupResult<T = Record<string, unknown>> extends DhmRecordEnvelope<T> {
  entityType: string;
  code: string;
  mergedFrom?: string;
}

export type DhmInboundStatus = "created" | "updated" | "unchanged" | "pending_review" | "duplicate";

export interface DhmInboundResult<T = Record<string, unknown>> {
  httpStatus: number;
  status: DhmInboundStatus;
  code?: string;
  inboundId?: string;
  record?: {
    id: string;
    version: number;
    isDeleted: boolean;
    data?: T;
    updatedAt?: string;
  };
  appliedFields?: string[];
  pendingFields?: string[];
  changeRequestId?: string;
  resultMessage?: string;
}

export interface DhmInboundSubmissionStatus<T = Record<string, unknown>> {
  inboundId: string;
  status: "RECEIVED" | "ACCEPTED" | "PENDING_REVIEW" | "DUPLICATE" | "REJECTED" | string;
  resultMessage: string | null;
  record: { id: string; code: string; version: number; isDeleted: boolean; data?: T } | null;
  changeRequest: {
    id: string;
    kind: string;
    status: string;
    pendingFields: string[];
    decisionNote: string | null;
    decidedAt: string | null;
  } | null;
}

/** `{ "error": "...", "code": "VALIDATION_FAILED", ...details }` — see §11 Error contract. */
export interface DhmErrorBody {
  error: string;
  code?: string;
  details?: unknown;
  unknownKeys?: string[];
  field?: string;
  value?: unknown;
  masterType?: string;
  fields?: string[];
  tombstone?: { id: string; code: string; deletedAt: string; version: number };
  mergedInto?: { id: string; code: string };
  currentVersion?: number;
  record?: unknown;
  inboundId?: string;
  matchKey?: string;
  retryAfter?: number;
  [key: string]: unknown;
}

export interface DhmCompanyData {
  code?: string;
  name: string;
  short_name?: string | null;
  company_code_sap?: string | null;
  country?: string | null;
  is_active?: boolean;
}

export interface DhmSiteData {
  code?: string;
  name: string;
  /** DHM UUID of the parent company (resolved by DHM, never a code). */
  company_id: string;
  address?: string | null;
  is_active?: boolean;
}

export interface DhmPlantData {
  code?: string;
  name: string;
  plant_code?: string | null;
  /** DHM UUID of the parent site (resolved by DHM, never a code). */
  site_id: string;
  is_active?: boolean;
}

export interface DhmExchangeRateData {
  code?: string;
  name: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  rate_date: string;
  from_decimals?: number | null;
  to_decimals?: number | null;
  coupa_id?: string | null;
  coupa_updated_at?: string | null;
  is_active?: boolean;
}

/** `record.created` | `record.updated` | `record.deleted` | `record.merged`. */
export type DhmWebhookEvent = "record.created" | "record.updated" | "record.deleted" | "record.merged";

export interface DhmWebhookPayload<T = Record<string, unknown>> {
  event: DhmWebhookEvent;
  occurredAt: string;
  eventId: string;
  deliveryId: string;
  entityType: string;
  recordId: string;
  version: number;
  data: T;
  sourceApplication?: string;
  /** record.deleted only, when the delete was actually a merge. */
  mergedInto?: { id: string; code: string };
  /** record.updated only, when a steward undeleted the record. */
  restored?: boolean;
  /** record.merged only. */
  retired?: { id: string; code: string };
  survivor?: { id: string; code: string };
}
