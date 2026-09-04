/**
 * TLS options for node-pg against local Docker Postgres or ApsaraDB RDS.
 */

export function sslModeFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url.replace(/^postgres(ql)?:/i, "http:"));
    return parsed.searchParams.get("sslmode");
  } catch {
    const match = url.match(/[?&]sslmode=([^&]+)/i);
    return match?.[1] ?? null;
  }
}

export function resolvePoolSslOptions(opts: {
  url: string;
  ssl?: boolean;
  sslRejectUnauthorized: boolean;
}): boolean | { rejectUnauthorized: boolean } {
  if (opts.ssl === false) {
    return false;
  }

  const mode = sslModeFromUrl(opts.url)?.toLowerCase() ?? null;
  const urlWantsSsl = mode === "require" || mode === "verify-ca" || mode === "verify-full";

  if (opts.ssl !== true && !urlWantsSsl) {
    return false;
  }

  if (mode === "verify-ca" || mode === "verify-full") {
    return { rejectUnauthorized: true };
  }
  return { rejectUnauthorized: opts.sslRejectUnauthorized };
}
