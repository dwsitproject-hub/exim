/**
 * Frontend config — env only; no hardcoded URLs or secrets (cursor-rules §2, §7).
 * NEXT_PUBLIC_* vars are inlined at build time for client; server has full process.env.
 */

function getEnv(key: string, defaultValue?: string): string {
  const v = typeof window !== "undefined"
    ? (process.env as Record<string, string | undefined>)[key]
    : process.env[key];
  return (v ?? defaultValue ?? "") as string;
}

/**
 * Browser-side API base:
 * - Relative (default `/api/backend`): fetch goes to this Next.js app; `app/api/backend/*` proxies
 *   server-side to `BACKEND_INTERNAL_URL` (VPC / Docker network). Browsers never touch the backend IP.
 * - Absolute `http(s)://.../api/v1`: direct to backend (local dev only).
 */
export const config = {
  apiBaseUrl: getEnv("NEXT_PUBLIC_API_URL", "/api/backend"),
} as const;
