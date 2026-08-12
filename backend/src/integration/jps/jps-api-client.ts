/**
 * JPS partner API HTTP client (x-api-key). Server-side only.
 * Contract: docs/INBOUND-SHIPPING-INSTRUCTION-PARTNER-API.md (v3.6+)
 */

import { config } from "../../config/index.js";
import { logger } from "../../utils/logger.js";
import {
  JpsApiError,
  type JpsApiResponse,
  type JpsCommodity,
  type JpsPort,
  type JpsShippingInstructionData,
  type JpsShippingInstructionPatchPayload,
  type JpsShippingInstructionPayload,
} from "./types.js";

export interface JpsApiClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export class JpsApiClient {
  constructor(private readonly options: JpsApiClientOptions) {}

  static fromConfig(): JpsApiClient {
    return new JpsApiClient({
      baseUrl: config.jps.apiBaseUrl,
      apiKey: config.jps.apiKey,
      timeoutMs: config.jps.requestTimeoutMs,
    });
  }

  get isConfigured(): boolean {
    return Boolean(this.options.baseUrl && this.options.apiKey);
  }

  async listPorts(): Promise<JpsPort[]> {
    const data = await this.request<JpsPort[]>("GET", "/ports");
    return Array.isArray(data) ? data : [];
  }

  async listCommodities(): Promise<JpsCommodity[]> {
    const data = await this.request<JpsCommodity[]>("GET", "/commodities");
    return Array.isArray(data) ? data : [];
  }

  async createShippingInstruction(
    payload: JpsShippingInstructionPayload
  ): Promise<JpsShippingInstructionData> {
    return this.request<JpsShippingInstructionData>("POST", "/shipping-instructions", payload);
  }

  async getShippingInstructionById(id: number): Promise<JpsShippingInstructionData> {
    return this.request<JpsShippingInstructionData>("GET", `/shipping-instructions/${id}`);
  }

  async getShippingInstructionByExternalReference(
    externalReference: string
  ): Promise<JpsShippingInstructionData> {
    const q = encodeURIComponent(externalReference);
    return this.request<JpsShippingInstructionData>(
      "GET",
      `/shipping-instructions?external_reference=${q}`
    );
  }

  /** Amend while partner status is Pending (v3.6). */
  async updateShippingInstruction(
    id: number,
    payload: JpsShippingInstructionPatchPayload
  ): Promise<JpsShippingInstructionData> {
    return this.request<JpsShippingInstructionData>(
      "PATCH",
      `/shipping-instructions/${id}`,
      payload
    );
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH",
    path: string,
    body?: unknown
  ): Promise<T> {
    if (!this.isConfigured) {
      throw new JpsApiError({
        httpStatus: 503,
        code: "NOT_CONFIGURED",
        message: "JPS_API_BASE_URL and JPS_API_KEY are required",
      });
    }

    const url = `${this.options.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      "x-api-key": this.options.apiKey,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let resp: Response;
    try {
      resp = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (err) {
      logger.warn("JPS API network error", { method, path, error: String(err) });
      throw new JpsApiError({
        httpStatus: 502,
        code: "NETWORK_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const text = await resp.text();
    let json: JpsApiResponse<T> | null = null;
    try {
      json = text ? (JSON.parse(text) as JpsApiResponse<T>) : null;
    } catch {
      throw new JpsApiError({
        httpStatus: resp.status,
        code: "INVALID_JSON",
        message: `JPS returned non-JSON (${resp.status}): ${text.slice(0, 300)}`,
      });
    }

    if (!json || typeof json !== "object") {
      throw new JpsApiError({
        httpStatus: resp.status,
        code: "EMPTY_RESPONSE",
        message: `JPS empty response (${resp.status})`,
      });
    }

    if (!resp.ok || json.success === false) {
      const errBody = json as {
        success?: false;
        error?: { code?: string; message?: string; details?: unknown };
        request_id?: string;
      };
      throw new JpsApiError({
        httpStatus: resp.status,
        code: errBody.error?.code ?? `HTTP_${resp.status}`,
        message: errBody.error?.message ?? `JPS request failed (${resp.status})`,
        requestId: errBody.request_id,
        details: errBody.error?.details,
      });
    }

    return json.data;
  }
}
