/**
 * Verify DWS Hub id_token (RS256) against JWKS; enforce iss, aud, exp.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface OidcIdTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  name?: string;
  nonce?: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(jwksUri: string) {
  let set = jwksCache.get(jwksUri);
  if (!set) {
    set = createRemoteJWKSet(new URL(jwksUri));
    jwksCache.set(jwksUri, set);
  }
  return set;
}

export async function verifyIdToken(params: {
  idToken: string;
  jwksUri: string;
  issuer: string;
  audience: string;
  /** When set (SP-initiated), must match id_token nonce. */
  expectedNonce?: string;
}): Promise<OidcIdTokenClaims> {
  const { payload } = await jwtVerify(params.idToken, getJwks(params.jwksUri), {
    issuer: params.issuer,
    audience: params.audience,
    algorithms: ["RS256"],
  });

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) {
    throw new Error("Invalid token payload (no subject)");
  }

  if (params.expectedNonce) {
    const nonce = typeof payload.nonce === "string" ? payload.nonce : "";
    if (nonce !== params.expectedNonce) {
      throw new Error("Invalid token payload (nonce mismatch)");
    }
  }

  return payload as OidcIdTokenClaims;
}

/** Test helper. */
export function clearJwksCache(): void {
  jwksCache.clear();
}
