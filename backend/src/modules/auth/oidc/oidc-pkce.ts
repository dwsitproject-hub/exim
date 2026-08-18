/**
 * PKCE (S256) + state/nonce helpers for OIDC authorize requests.
 */

import { createHash, randomBytes } from "crypto";

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generateCodeVerifier(): string {
  return base64Url(randomBytes(32));
}

export function codeChallengeS256(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export function generateState(): string {
  return base64Url(randomBytes(24));
}

export function generateNonce(): string {
  return base64Url(randomBytes(24));
}

export interface PkceBundle {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  nonce: string;
}

export function createPkceBundle(): PkceBundle {
  const codeVerifier = generateCodeVerifier();
  return {
    codeVerifier,
    codeChallenge: codeChallengeS256(codeVerifier),
    state: generateState(),
    nonce: generateNonce(),
  };
}
