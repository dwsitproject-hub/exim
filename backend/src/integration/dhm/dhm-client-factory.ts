/**
 * Build a DhmClient from config. Centralized so callers do not re-read process.env.
 */

import { DhmClient } from "./dhm-client.js";

export interface DhmClientConfig {
  baseUrl: string;
  publicKey: string;
  privateKey: string;
  requestTimeoutMs: number;
}

export function isDhmConfigured(cfg: DhmClientConfig): boolean {
  return Boolean(cfg.baseUrl.trim() && cfg.publicKey.trim() && cfg.privateKey.trim());
}

export function createDhmClient(cfg: DhmClientConfig): DhmClient {
  return new DhmClient({
    baseUrl: cfg.baseUrl,
    publicKey: cfg.publicKey,
    privateKey: cfg.privateKey,
    requestTimeoutMs: cfg.requestTimeoutMs,
  });
}
