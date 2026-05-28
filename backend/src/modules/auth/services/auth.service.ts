/**
 * Auth service: business logic only. No HTTP, no raw SQL.
 * Passwords hashed with bcrypt; never store plain text.
 * Login: requires verified email. Accounts are provisioned by admins.
 */

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { config } from "../../../config/index.js";
import { UserRepository } from "../repositories/user.repository.js";
import { RefreshTokenRepository } from "../repositories/refresh-token.repository.js";
import { EmailVerificationTokenRepository } from "../repositories/email-verification-token.repository.js";
import { PasswordResetTokenRepository } from "../repositories/password-reset-token.repository.js";
import { sendPasswordResetEmail } from "./email.service.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import { userRowToAuthUser } from "../auth-user-mapper.js";
import type { AuthUser, LoginResponseData, RefreshResponseData } from "../dto/index.js";

const SALT_ROUNDS = 12;
const RESET_TOKEN_EXPIRY_HOURS = 1;

/** Parse expires_in (e.g. "1h", "7d") to seconds for response. */
function expiresInSeconds(exp: string): number {
  const match = exp.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 3600;
  const n = parseInt(match[1]!, 10);
  const unit = match[2];
  if (unit === "s") return n;
  if (unit === "m") return n * 60;
  if (unit === "h") return n * 3600;
  if (unit === "d") return n * 86400;
  return 3600;
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly refreshTokenRepo: RefreshTokenRepository,
    private readonly verificationTokenRepo: EmailVerificationTokenRepository,
    private readonly passwordResetTokenRepo: PasswordResetTokenRepository
  ) {}

  async login(email: string, password: string): Promise<LoginResponseData> {
    const accessSecret = config.jwt.accessSecret;
    if (!accessSecret) {
      throw new AppError("Auth is not configured (missing JWT_ACCESS_SECRET)", 500);
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new AppError("Invalid email or password", 401);
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      throw new AppError("Invalid email or password", 401);
    }

    if (!user.email_verified_at) {
      throw new AppError("Please verify your email before signing in", 403);
    }

    const authUser = userRowToAuthUser(user);
    const accessToken = this.signAccessToken(authUser);
    const expiresIn = expiresInSeconds(config.jwt.accessExpiresIn ?? "4h");

    const refreshTokenValue = randomBytes(32).toString("hex");
    const refreshExpires = config.jwt.refreshExpiresIn ?? "4h";
    const refreshExpiresSeconds = expiresInSeconds(refreshExpires);
    const refreshExpiresAt = new Date(Date.now() + refreshExpiresSeconds * 1000);
    await this.refreshTokenRepo.create({
      userId: user.id,
      token: refreshTokenValue,
      expiresAt: refreshExpiresAt,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshTokenValue,
      token_type: "Bearer",
      expires_in: expiresIn,
      user: authUser,
    };
  }

  async refresh(refreshToken: string): Promise<RefreshResponseData> {
    const accessSecret = config.jwt.accessSecret;
    if (!accessSecret) {
      throw new AppError("Auth is not configured (missing JWT_ACCESS_SECRET)", 500);
    }

    const row = await this.refreshTokenRepo.findByToken(refreshToken);
    if (!row) {
      throw new AppError("Invalid or expired refresh token", 401);
    }
    if (row.revoked_at) {
      throw new AppError("Refresh token has been revoked", 401);
    }
    if (new Date() > row.expires_at) {
      throw new AppError("Refresh token has expired", 401);
    }

    const user = await this.userRepo.findById(row.user_id);
    if (!user || !user.is_active) {
      throw new AppError("User not found or inactive", 401);
    }

    const authUser = userRowToAuthUser(user);
    const accessToken = this.signAccessToken(authUser);
    const expiresIn = expiresInSeconds(config.jwt.accessExpiresIn ?? "4h");

    await this.refreshTokenRepo.revokeByToken(refreshToken);
    const newRefreshValue = randomBytes(32).toString("hex");
    const refreshExpiresSeconds = expiresInSeconds(config.jwt.refreshExpiresIn ?? "4h");
    const refreshExpiresAt = new Date(Date.now() + refreshExpiresSeconds * 1000);
    await this.refreshTokenRepo.create({
      userId: user.id,
      token: newRefreshValue,
      expiresAt: refreshExpiresAt,
    });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      refresh_token: newRefreshValue,
      user: authUser,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokenRepo.revokeByToken(refreshToken);
  }

  async getMe(userId: string): Promise<AuthUser | null> {
    const user = await this.userRepo.findById(userId);
    return user ? userRowToAuthUser(user) : null;
  }

  /** Hash password for storage (e.g. seed or user create). Never store plain text. */
  async hashPassword(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  async verifyEmail(token: string): Promise<void> {
    const row = await this.verificationTokenRepo.findByToken(token);
    if (!row) {
      throw new AppError("Invalid or expired verification link", 400);
    }
    if (new Date() > row.expires_at) {
      await this.verificationTokenRepo.deleteByToken(token);
      throw new AppError("Verification link has expired", 400);
    }
    await this.userRepo.setEmailVerified(row.user_id);
    await this.verificationTokenRepo.deleteByToken(token);
  }

  async forgotPassword(email: string, userAgent?: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email.trim().toLowerCase());
    if (!user) {
      // Do not reveal whether email exists
      return;
    }
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    await this.passwordResetTokenRepo.deleteByUserId(user.id);
    await this.passwordResetTokenRepo.create({ userId: user.id, token, expiresAt });
    await sendPasswordResetEmail(user.email, user.name, token, userAgent);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const row = await this.passwordResetTokenRepo.findByToken(token);
    if (!row) {
      throw new AppError("Invalid or expired reset link", 400);
    }
    if (new Date() > row.expires_at) {
      await this.passwordResetTokenRepo.deleteByToken(token);
      throw new AppError("Reset link has expired", 400);
    }
    const passwordHash = await this.hashPassword(newPassword);
    await this.userRepo.updatePassword(row.user_id, passwordHash);
    await this.passwordResetTokenRepo.deleteByToken(token);
  }

  private signAccessToken(user: AuthUser): string {
    const secret = config.jwt.accessSecret;
    if (!secret) throw new AppError("Auth is not configured", 500);
    const expiresIn = config.jwt.accessExpiresIn ?? "4h";
    return jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permission_overrides: user.permission_overrides,
        type: "access",
      },
      secret,
      { expiresIn } as jwt.SignOptions
    );
  }
}
