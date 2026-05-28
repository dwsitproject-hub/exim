/**
 * Environment config loader.
 * All configurable values from env; no hardcoded secrets.
 */

import dotenv from "dotenv";
import path from "path";

// Load root .env first (e.g. EOS/.env when running from EOS/backend), then backend .env so local overrides work
const backendDir = path.resolve(__dirname, "../..");
const rootEnv = path.join(backendDir, "..", ".env");
dotenv.config({ path: rootEnv });
dotenv.config();

const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const getEnvOptional = (key: string, defaultValue?: string): string | undefined => {
  return process.env[key] ?? defaultValue;
};

/**
 * Local storage root: explicit STORAGE_LOCAL_PATH, or Synology layout
 * `{STORAGE_SYNOLOGY_ROOT}/{STORAGE_DEPLOYMENT}/{STORAGE_PROJECT_SLUG}` (e.g. dev/EOS for dev integration).
 */
/**
 * Express `trust proxy` for accurate `req.ip` behind reverse proxies (Docker, Next.js rewrites, nginx).
 * express-rate-limit rejects boolean `true` (too permissive); use a hop count (e.g. 1) or an Express subnet string.
 * Omit TRUST_PROXY to keep Express default (false) when no proxy forwards X-Forwarded-For.
 */
function parseTrustProxy(): boolean | number | string | undefined {
  const raw = getEnvOptional("TRUST_PROXY")?.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === "false" || lower === "0") return false;
  if (lower === "true" || lower === "yes") return 1;
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n <= 0 ? false : n;
  }
  return raw;
}

function resolveStorageLocalPath(): string {
  const explicit = getEnvOptional("STORAGE_LOCAL_PATH")?.trim();
  if (explicit) return explicit;

  const root = getEnvOptional("STORAGE_SYNOLOGY_ROOT")?.trim();
  const deployment = getEnvOptional("STORAGE_DEPLOYMENT")?.trim();
  const project = getEnvOptional("STORAGE_PROJECT_SLUG")?.trim();
  if (root && deployment && project) {
    return path.join(root, deployment, project);
  }

  return "./uploads";
}

/** Parse JWT_ACCESS_EXPIRES_IN / JWT_REFRESH_EXPIRES_IN (e.g. "4h", "7d") to milliseconds. */
function parseJwtDurationToMs(exp: string): number {
  const match = exp.match(/^(\d+)(s|m|h|d)$/i);
  if (!match) return 3600 * 1000;
  const n = parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  let seconds: number;
  if (unit === "s") seconds = n;
  else if (unit === "m") seconds = n * 60;
  else if (unit === "h") seconds = n * 3600;
  else if (unit === "d") seconds = n * 86400;
  else seconds = 3600;
  return seconds * 1000;
}

export const config = {
  nodeEnv: getEnvOptional("NODE_ENV", "development"),
  /** When set, applied as `app.set("trust proxy", value)`. See parseTrustProxy. */
  trustProxy: parseTrustProxy(),
  port: (() => {
    const raw = getEnvOptional("PORT", "3003") ?? "3003";
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? 3003 : n;
  })(),
  database: {
    url: getEnv("DATABASE_URL"),
  },
  jwt: {
    accessSecret: getEnvOptional("JWT_ACCESS_SECRET"),
    /** Unused: refresh tokens are opaque DB rows. Kept for future JWT-based refresh or ops consistency. */
    refreshSecret: getEnvOptional("JWT_REFRESH_SECRET"),
    accessExpiresIn: getEnvOptional("JWT_ACCESS_EXPIRES_IN", "4h"),
    refreshExpiresIn: getEnvOptional("JWT_REFRESH_EXPIRES_IN", "4h"),
    /** HttpOnly refresh cookie maxAge; must match DB refresh expiry (see auth-cookies). */
    refreshExpiresInMs: parseJwtDurationToMs(
      getEnvOptional("JWT_REFRESH_EXPIRES_IN", "4h") ?? "4h"
    ),
  },
  storage: {
    type: getEnvOptional("STORAGE_TYPE", "local"),
    localPath: resolveStorageLocalPath(),
  },
  log: {
    level: getEnvOptional("LOG_LEVEL", "info"),
  },
  cors: {
    origins: getEnvOptional("CORS_ORIGINS")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [],
  },
  /** Set true when the API is only served over HTTPS so auth cookies use the Secure flag. */
  cookieSecure: (getEnvOptional("COOKIE_SECURE", "false") ?? "false").toLowerCase() === "true",
  poPolling: {
    enabled: (getEnvOptional("PO_POLLING_ENABLED", "false") ?? "false") === "true",
    intervalMs: (() => {
      const raw = getEnvOptional("PO_POLLING_INTERVAL_MS", "300000") ?? "300000";
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? 5 * 60 * 1000 : Math.max(60000, n);
    })(),
    saasApiBaseUrl: getEnvOptional("SAAS_PO_API_BASE_URL"),
  },
  /** Coupa: `purchase_orders` → `import_purchase_order` (OAuth2 client credentials or static token). */
  coupa: {
    enabled: (getEnvOptional("COUPA_STAGING_INTEGRATION_ENABLED", "false") ?? "false") === "true",
    baseUrl: (getEnvOptional("COUPA_BASE_URL", "") ?? "").replace(/\/+$/, ""),
    /** Optional when using OAuth2 client credentials (COUPA_CLIENT_ID / COUPA_CLIENT_SECRET). */
    accessToken: getEnvOptional("COUPA_API_ACCESS_TOKEN", "") ?? "",
    clientId: getEnvOptional("COUPA_CLIENT_ID", "") ?? "",
    clientSecret: getEnvOptional("COUPA_CLIENT_SECRET", "") ?? "",
    /**
     * OAuth2 token URL. If empty, dev uses `COUPA_BASE_URL` + `/oauth2/tokens` (confirm in Coupa API docs for your host).
     */
    oauthTokenUrl: getEnvOptional("COUPA_OAUTH_TOKEN_URL", "") ?? "",
    oauthScope: getEnvOptional("COUPA_OAUTH_SCOPE", "") ?? "",
    /**
     * Full URL or path relative to COUPA_BASE_URL, e.g. /api/purchase_orders?status=issued
     * (exact path depends on your Coupa tenant API version).
     */
    issuedListPathOrUrl: getEnvOptional("COUPA_ISSUED_POS_PATH", "/") ?? "/",
    requestTimeoutMs: (() => {
      const raw = getEnvOptional("COUPA_REQUEST_TIMEOUT_MS", "30000") ?? "30000";
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? 30000 : Math.max(5000, n);
    })(),
    ingestIntervalMs: (() => {
      const raw = getEnvOptional("COUPA_INGEST_INTERVAL_MS", "300000") ?? "300000";
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? 5 * 60 * 1000 : Math.max(60000, n);
    })(),
    processorIntervalMs: (() => {
      const raw = getEnvOptional("COUPA_PROCESSOR_INTERVAL_MS", "120000") ?? "120000";
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? 120_000 : Math.max(30_000, n);
    })(),
  },
  /** Registration: allow any email when true (e.g. development); otherwise only ALLOWED_EMAIL_DOMAIN. */
  auth: {
    allowAnyEmail: (getEnvOptional("ALLOW_ANY_EMAIL", "false") ?? "false").toLowerCase() === "true",
    allowedEmailDomain: getEnvOptional("ALLOWED_EMAIL_DOMAIN", "energi-up.com") ?? "energi-up.com",
    /** Base URL of frontend for verification and reset links (e.g. http://localhost:3000). */
    frontendBaseUrl: getEnvOptional("FRONTEND_BASE_URL", "http://localhost:3000") ?? "http://localhost:3000",
  },
  /** Display name and assets for transactional emails (password reset, etc.). */
  email: {
    appName: getEnvOptional("EMAIL_APP_NAME", "EOS") ?? "EOS",
    /** Absolute URL to logo image; if unset, defaults to FRONTEND_BASE_URL/faveicon/android-chrome-192x192.png */
    logoUrl: getEnvOptional("EMAIL_LOGO_URL"),
  },
  /** IDR per 1 USD for dashboard procurement report (PO lines in IDR → US$). Optional; default 16500. */
  dashboard: {
    idrPerUsd: (() => {
      const raw = getEnvOptional("DASHBOARD_IDR_PER_USD", "16500") ?? "16500";
      const n = parseFloat(raw);
      return Number.isFinite(n) && n > 0 ? n : 16500;
    })(),
  },
  smtp: {
    host: getEnvOptional("SMTP_HOST", "localhost"),
    port: (() => {
      const raw = getEnvOptional("SMTP_PORT", "587") ?? "587";
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? 587 : n;
    })(),
    secure: (getEnvOptional("SMTP_SECURE", "false") ?? "false").toLowerCase() === "true",
    user: getEnvOptional("SMTP_USER"),
    /** SMTP_PASS or SMTP_PASSWORD (both supported). Use `||` so Docker's empty SMTP_PASS does not hide SMTP_PASSWORD. */
    pass: getEnvOptional("SMTP_PASS") || getEnvOptional("SMTP_PASSWORD"),
    from: getEnvOptional("SMTP_FROM", "noreply@energi-up.com"),
  },
} as const;

export type Config = typeof config;
