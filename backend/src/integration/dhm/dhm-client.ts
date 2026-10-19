/**
 * DHM (Data Hub Management) /v1 client.
 * Auth: application key pair headers (X-DHM-Public-Key / X-DHM-Private-Key) — batch-job friendly,
 * no token refresh needed (§4A of CLIENT_INTEGRATION.md). Retries 429 / 5xx with backoff, honouring
 * `Retry-After`. `Idempotency-Key` is sent on every POST/PUT/DELETE so backend retries are safe.
 */

import { randomUUID } from "crypto";
import { logger } from "../../utils/logger.js";
import { DhmApiError } from "./dhm-errors.js";
import type {
  DhmEntitySlug,
  DhmErrorBody,
  DhmInboundResult,
  DhmInboundStatus,
  DhmInboundSubmissionStatus,
  DhmLookupResult,
  DhmSyncPage,
} from "./types.js";

export interface DhmClientOptions {
  baseUrl: string;
  publicKey: string;
  privateKey: string;
  requestTimeoutMs: number;
  maxRetries?: number;
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  ifMatch?: number;
  /** Treat these HTTP statuses as a normal (non-throwing) result — caller inspects the body. */
  acceptStatuses?: number[];
}

function buildQuery(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DhmClient {
  constructor(private readonly options: DhmClientOptions) {}

  isConfigured(): boolean {
    return Boolean(this.options.baseUrl.trim() && this.options.publicKey.trim() && this.options.privateKey.trim());
  }

  private async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<{ status: number; body: T }> {
    const maxRetries = this.options.maxRetries ?? 3;
    const url = `${this.options.baseUrl}${path}${buildQuery(opts.query)}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-DHM-Public-Key": this.options.publicKey,
      "X-DHM-Private-Key": this.options.privateKey,
    };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    if (opts.ifMatch !== undefined) headers["If-Match"] = String(opts.ifMatch);

    let attempt = 0;
    for (;;) {
      attempt += 1;
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(this.options.requestTimeoutMs),
        });
      } catch (err) {
        if (attempt > maxRetries) {
          throw new DhmApiError(0, "NETWORK_ERROR", err instanceof Error ? err.message : "DHM request failed");
        }
        await sleep(backoffMs(attempt));
        continue;
      }

      const text = await res.text();
      let parsed: unknown = undefined;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          // Non-JSON body; leave parsed undefined.
        }
      }

      if (res.ok || opts.acceptStatuses?.includes(res.status)) {
        return { status: res.status, body: (parsed ?? {}) as T };
      }

      const errBody = (parsed as DhmErrorBody) ?? { error: text || `HTTP ${res.status}` };
      const code = errBody.code ?? `HTTP_${res.status}`;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt <= maxRetries) {
        const retryAfterHeader = res.headers.get("Retry-After");
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : backoffMs(attempt);
        logger.warn("DHM request retrying", { method, path, status: res.status, code, attempt });
        await sleep(Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : backoffMs(attempt));
        continue;
      }

      throw new DhmApiError(res.status, code, errBody.error || `DHM request failed: HTTP ${res.status}`, errBody);
    }
  }

  // -- Discovery --------------------------------------------------------

  async getCatalog(): Promise<{ application: { slug: string; name: string }; count: number; entities: unknown[] }> {
    const { body } = await this.request<{ application: { slug: string; name: string }; count: number; entities: unknown[] }>(
      "GET",
      "/v1/catalog"
    );
    return body;
  }

  // -- Sync / lookup ------------------------------------------------------

  async syncPage<T = Record<string, unknown>>(
    slug: DhmEntitySlug,
    params: { cursor?: string; updatedSince?: string; limit?: number; includeDeleted?: boolean }
  ): Promise<DhmSyncPage<T>> {
    const { body } = await this.request<DhmSyncPage<T>>("GET", `/v1/sync/${slug}`, {
      query: {
        cursor: params.cursor,
        updatedSince: params.cursor ? undefined : params.updatedSince,
        limit: params.limit,
        includeDeleted: params.includeDeleted,
      },
    });
    return body;
  }

  async lookupByCode<T = Record<string, unknown>>(slug: DhmEntitySlug, code: string): Promise<DhmLookupResult<T>> {
    const { body } = await this.request<DhmLookupResult<T>>("GET", `/v1/lookup/${slug}/${encodeURIComponent(code)}`);
    return body;
  }

  // -- Inbound (pattern A: master owner) -----------------------------------

  async inboundCreate<T = Record<string, unknown>>(
    slug: DhmEntitySlug,
    payload: Record<string, unknown>,
    idempotencyKey: string = randomUUID()
  ): Promise<DhmInboundResult<T>> {
    const { status, body } = await this.request<Record<string, unknown>>("POST", `/v1/inbound/${slug}`, {
      body: payload,
      idempotencyKey,
      acceptStatuses: [200, 201, 202, 409],
    });
    return normalizeInboundResponse<T>(status, body);
  }

  async inboundUpdate<T = Record<string, unknown>>(
    slug: DhmEntitySlug,
    code: string,
    payload: Record<string, unknown>,
    opts: { version?: number; idempotencyKey?: string } = {}
  ): Promise<DhmInboundResult<T>> {
    const body = opts.version !== undefined ? { ...payload, version: opts.version } : payload;
    const { status, body: respBody } = await this.request<Record<string, unknown>>(
      "PUT",
      `/v1/inbound/${slug}/${encodeURIComponent(code)}`,
      {
        body,
        idempotencyKey: opts.idempotencyKey ?? randomUUID(),
        acceptStatuses: [200, 202],
      }
    );
    return normalizeInboundResponse<T>(status, respBody);
  }

  async inboundDelete(
    slug: DhmEntitySlug,
    code: string,
    opts: { version?: number; reason?: string } = {}
  ): Promise<{ status: string; httpStatus: number }> {
    const { status, body } = await this.request<Record<string, unknown>>(
      "DELETE",
      `/v1/inbound/${slug}/${encodeURIComponent(code)}`,
      {
        body: { reason: opts.reason },
        ifMatch: opts.version,
        acceptStatuses: [200, 202],
      }
    );
    return { status: String(body.status ?? ""), httpStatus: status };
  }

  async getInboundStatus<T = Record<string, unknown>>(inboundId: string): Promise<DhmInboundSubmissionStatus<T>> {
    const { body } = await this.request<DhmInboundSubmissionStatus<T>>("GET", `/v1/inbound/${encodeURIComponent(inboundId)}`);
    return body;
  }
}

function backoffMs(attempt: number): number {
  const base = 300 * 2 ** (attempt - 1);
  const jitter = Math.random() * 150;
  return Math.min(5000, base + jitter);
}

function normalizeInboundResponse<T>(httpStatus: number, body: Record<string, unknown>): DhmInboundResult<T> {
  const status = (body.status as DhmInboundStatus) ?? (httpStatus === 201 ? "created" : "updated");
  return {
    httpStatus,
    status,
    code: typeof body.code === "string" ? body.code : (body.record as { code?: string } | undefined)?.code,
    inboundId: typeof body.inboundId === "string" ? body.inboundId : undefined,
    record: body.record as DhmInboundResult<T>["record"],
    appliedFields: Array.isArray(body.appliedFields) ? (body.appliedFields as string[]) : undefined,
    pendingFields: Array.isArray(body.pendingFields) ? (body.pendingFields as string[]) : undefined,
    changeRequestId: typeof body.changeRequestId === "string" ? body.changeRequestId : undefined,
    resultMessage: typeof body.resultMessage === "string" ? body.resultMessage : undefined,
  };
}
