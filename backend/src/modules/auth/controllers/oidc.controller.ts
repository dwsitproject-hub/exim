/**
 * OIDC controllers: SP/IdP login flows for DWS Hub. Redirect-only (no JSON on success).
 */

import type { Request, Response, NextFunction } from "express";
import { config } from "../../../config/index.js";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { setAuthCookies } from "../auth-cookies.js";
import {
  clearOidcPendingCookies,
  readOidcPendingCookies,
  setOidcPendingCookies,
} from "../oidc/oidc-cookies.js";
import { AuthService } from "../services/auth.service.js";
import { OidcService } from "../services/oidc.service.js";
import { UserRepository } from "../repositories/user.repository.js";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository.js";
import { EmailVerificationTokenRepository } from "../repositories/email-verification-token.repository.js";
import { PasswordResetTokenRepository } from "../repositories/password-reset-token.repository.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import { logger } from "../../../utils/logger.js";

const userRepo = new UserRepository();
const refreshTokenRepo = new RefreshTokenRepository();
const verificationTokenRepo = new EmailVerificationTokenRepository();
const passwordResetTokenRepo = new PasswordResetTokenRepository();
const authService = new AuthService(userRepo, refreshTokenRepo, verificationTokenRepo, passwordResetTokenRepo);
const oidcService = new OidcService(authService);

function ssoErrorRedirect(message: string): string {
  const url = new URL("/login", config.auth.frontendBaseUrl);
  url.searchParams.set("sso_error", message);
  return url.toString();
}

export function oidcStatus(_req: Request, res: Response): void {
  sendSuccess(res, { enabled: oidcService.isEnabled() }, { statusCode: 200 });
}

export async function oidcLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!oidcService.isEnabled()) {
    sendError(res, "OIDC is not configured", { statusCode: 404 });
    return;
  }
  try {
    const start = await oidcService.startLogin();
    setOidcPendingCookies(res, {
      state: start.state,
      nonce: start.nonce,
      codeVerifier: start.codeVerifier,
    });
    res.redirect(302, start.authorizeUrl);
  } catch (e) {
    next(e);
  }
}

export async function oidcCallback(req: Request, res: Response, _next: NextFunction): Promise<void> {
  if (!oidcService.isEnabled()) {
    sendError(res, "OIDC is not configured", { statusCode: 404 });
    return;
  }

  try {
    const q = req.query as Record<string, string | undefined>;
    const pending = readOidcPendingCookies(req);
    const data = await oidcService.handleCallback({
      code: typeof q.code === "string" ? q.code : undefined,
      state: typeof q.state === "string" ? q.state : undefined,
      codeVerifierFromQuery: typeof q.code_verifier === "string" ? q.code_verifier : undefined,
      pending,
      error: typeof q.error === "string" ? q.error : undefined,
      errorDescription: typeof q.error_description === "string" ? q.error_description : undefined,
    });

    clearOidcPendingCookies(res);
    setAuthCookies(res, data);
    res.redirect(303, `${config.auth.frontendBaseUrl}/login`);
  } catch (e) {
    clearOidcPendingCookies(res);
    const message =
      e instanceof AppError
        ? e.message
        : e instanceof Error
          ? "SSO login failed"
          : "SSO login failed";
    logger.warn(
      `OIDC callback failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`
    );
    res.redirect(303, ssoErrorRedirect(message));
  }
}
