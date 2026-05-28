/**
 * Auth controllers: parse request, return response only. No business logic.
 */

import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { clearAuthCookies, setAuthCookies } from "../auth-cookies.js";
import { validateLoginBody, validateRefreshBody, validateVerifyEmail, validateForgotPasswordBody, validateResetPasswordBody } from "../validators/index.js";
import { AuthService } from "../services/auth.service.js";
import { UserRepository } from "../repositories/user.repository.js";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository.js";
import { EmailVerificationTokenRepository } from "../repositories/email-verification-token.repository.js";
import { PasswordResetTokenRepository } from "../repositories/password-reset-token.repository.js";

const userRepo = new UserRepository();
const refreshTokenRepo = new RefreshTokenRepository();
const verificationTokenRepo = new EmailVerificationTokenRepository();
const passwordResetTokenRepo = new PasswordResetTokenRepository();
const authService = new AuthService(userRepo, refreshTokenRepo, verificationTokenRepo, passwordResetTokenRepo);

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateLoginBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const data = await authService.login(validation.data.email, validation.data.password);
    setAuthCookies(res, data);
    sendSuccess(
      res,
      { user: data.user, expires_in: data.expires_in, token_type: data.token_type },
      { message: "Login successful", statusCode: 201 }
    );
  } catch (e) {
    next(e);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateRefreshBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const data = await authService.refresh(validation.data.refresh_token);
    setAuthCookies(res, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
    });
    sendSuccess(
      res,
      { user: data.user, expires_in: data.expires_in, token_type: data.token_type },
      { message: "Token refreshed successfully", statusCode: 200 }
    );
  } catch (e) {
    next(e);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateRefreshBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    await authService.logout(validation.data.refresh_token);
    clearAuthCookies(res);
    sendSuccess(res, {}, { message: "Logout successful", statusCode: 200 });
  } catch (e) {
    next(e);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user;
  if (!user) {
    sendError(res, "Unauthorized", { statusCode: 401 });
    return;
  }
  try {
    const me = await authService.getMe(user.id);
    if (!me) {
      sendError(res, "User not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, me, { statusCode: 200 });
  } catch (e) {
    next(e);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateVerifyEmail(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    await authService.verifyEmail(validation.data.token);
    sendSuccess(res, {}, { message: "Email verified. You can now sign in.", statusCode: 200 });
  } catch (e) {
    next(e);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateForgotPasswordBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    await authService.forgotPassword(validation.data.email, req.get("user-agent") ?? undefined);
    sendSuccess(res, {}, { message: "If an account exists with this email, you will receive a password reset link.", statusCode: 200 });
  } catch (e) {
    next(e);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateResetPasswordBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    await authService.resetPassword(validation.data.token, validation.data.new_password);
    sendSuccess(res, {}, { message: "Password has been reset. You can now sign in.", statusCode: 200 });
  } catch (e) {
    next(e);
  }
}
