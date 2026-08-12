/**
 * DWS Hub OIDC service: build authorize URL, exchange code, verify id_token, map user.
 */

import { config } from "../../../config/index.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import { logger } from "../../../utils/logger.js";
import { fetchDiscovery } from "../oidc/oidc-discovery.js";
import { createPkceBundle } from "../oidc/oidc-pkce.js";
import { exchangeAuthorizationCode } from "../oidc/oidc-token.js";
import { verifyIdToken } from "../oidc/oidc-verify.js";
import type { AuthService } from "./auth.service.js";
import type { LoginResponseData } from "../dto/index.js";

export interface OidcAuthorizeStart {
  authorizeUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface OidcCallbackInput {
  code: string | undefined;
  state: string | undefined;
  /** Present on IdP-initiated (Hub tile) flow. */
  codeVerifierFromQuery: string | undefined;
  /** SP-initiated cookies. */
  pending: {
    state: string | undefined;
    nonce: string | undefined;
    codeVerifier: string | undefined;
  };
  error: string | undefined;
  errorDescription: string | undefined;
}

export class OidcService {
  constructor(private readonly authService: AuthService) {}

  isEnabled(): boolean {
    return config.oidc.enabled;
  }

  async startLogin(): Promise<OidcAuthorizeStart> {
    if (!config.oidc.enabled) {
      throw new AppError("OIDC is not configured", 404);
    }

    const meta = await fetchDiscovery(config.oidc.discoveryUrl);
    const pkce = createPkceBundle();

    const url = new URL(meta.authorization_endpoint);
    url.searchParams.set("client_id", config.oidc.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", config.oidc.redirectUri);
    url.searchParams.set("scope", config.oidc.scopes);
    url.searchParams.set("code_challenge", pkce.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", pkce.state);
    url.searchParams.set("nonce", pkce.nonce);

    return {
      authorizeUrl: url.toString(),
      state: pkce.state,
      nonce: pkce.nonce,
      codeVerifier: pkce.codeVerifier,
    };
  }

  async handleCallback(input: OidcCallbackInput): Promise<LoginResponseData> {
    if (!config.oidc.enabled) {
      throw new AppError("OIDC is not configured", 404);
    }

    if (input.error) {
      throw new AppError(
        input.errorDescription || input.error || "SSO login failed",
        401
      );
    }

    const code = input.code?.trim();
    if (!code) {
      throw new AppError("Missing authorization code", 400);
    }

    const idpInitiated = Boolean(input.codeVerifierFromQuery?.trim());
    let codeVerifier: string;
    let expectedNonce: string | undefined;

    if (idpInitiated) {
      codeVerifier = input.codeVerifierFromQuery!.trim();
    } else {
      if (!input.pending.state || !input.pending.codeVerifier) {
        throw new AppError("SSO session expired. Please try signing in again.", 401);
      }
      if (!input.state || input.state !== input.pending.state) {
        throw new AppError("Invalid SSO state", 401);
      }
      codeVerifier = input.pending.codeVerifier;
      expectedNonce = input.pending.nonce;
    }

    const meta = await fetchDiscovery(config.oidc.discoveryUrl);
    const tokenResp = await exchangeAuthorizationCode({
      tokenEndpoint: meta.token_endpoint,
      code,
      codeVerifier,
      redirectUri: config.oidc.redirectUri,
      clientId: config.oidc.clientId,
    });

    const claims = await verifyIdToken({
      idToken: tokenResp.id_token!,
      jwksUri: meta.jwks_uri,
      issuer: meta.issuer,
      audience: config.oidc.clientId,
      expectedNonce,
    });

    const email = (claims.email ?? "").trim().toLowerCase();
    const session = await this.authService.loginWithOidc(String(claims.sub), email);
    logger.info(`OIDC login: ${session.user.email}`);
    return session;
  }
}
