/**
 * Syncera client-credentials auth with in-memory token cache.
 */

import { logger } from "../../utils/logger.js";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class SynceraAuthClient {
  private token: string | null = null;
  private expiresAtMs = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly requestTimeoutMs: number
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAtMs - REFRESH_BUFFER_MS) {
      return this.token;
    }
    const url = `${this.baseUrl}/api/v1/auth`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ clientId: this.clientId, clientSecret: this.clientSecret }),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    const text = await res.text();
    if (!res.ok) {
      logger.warn("Syncera auth failed", { status: res.status });
      throw new Error(`Syncera auth failed: HTTP ${res.status}`);
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error("Syncera auth returned non-JSON");
    }
    const token =
      (typeof body.accessToken === "string" && body.accessToken) ||
      (typeof body.access_token === "string" && body.access_token) ||
      "";
    if (!token) {
      throw new Error("Syncera auth missing access token");
    }
    const expiresInRaw = body.expiresIn ?? body.expires_in;
    const expiresIn = typeof expiresInRaw === "number" && Number.isFinite(expiresInRaw) ? expiresInRaw : 3600;
    this.token = token;
    this.expiresAtMs = Date.now() + expiresIn * 1000;
    return token;
  }
}
