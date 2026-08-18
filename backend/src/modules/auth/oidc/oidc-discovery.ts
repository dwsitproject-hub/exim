/**
 * OIDC discovery document cache for DWS Hub.
 */

export interface OidcDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

let cached: { doc: OidcDiscoveryDocument; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function fetchDiscovery(discoveryUrl: string): Promise<OidcDiscoveryDocument> {
  const now = Date.now();
  if (cached && cached.doc && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.doc;
  }

  const resp = await fetch(discoveryUrl, { signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) {
    throw new Error(`OIDC discovery failed: HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as Partial<OidcDiscoveryDocument>;
  if (
    !json.issuer ||
    !json.authorization_endpoint ||
    !json.token_endpoint ||
    !json.jwks_uri
  ) {
    throw new Error("OIDC discovery document missing required fields");
  }
  const doc: OidcDiscoveryDocument = {
    issuer: json.issuer,
    authorization_endpoint: json.authorization_endpoint,
    token_endpoint: json.token_endpoint,
    jwks_uri: json.jwks_uri,
  };
  cached = { doc, fetchedAt: now };
  return doc;
}

/** Test helper — clear discovery cache. */
export function clearDiscoveryCache(): void {
  cached = null;
}
