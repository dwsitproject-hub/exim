/**
 * Rate limits for unauthenticated auth endpoints (credential stuffing / abuse mitigation).
 * Login uses a strict bucket. Refresh/logout use a higher ceiling and skipFailedRequests so
 * expected 4xx (no cookie, invalid/expired token) do not exhaust the limit on page loads.
 */

import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { sendError } from "../shared/response.js";
import { config } from "../config/index.js";

function tooMany(req: Request, res: Response): void {
  sendError(res, "Too many requests. Please try again later.", { statusCode: 429 });
}

const windowMs15 = 15 * 60 * 1000;
const isDev = (config.nodeEnv ?? "development") === "development";

/** Login — failed attempts still count (brute-force mitigation). */
export const loginLimiter = rateLimit({
  windowMs: windowMs15,
  max: isDev ? 80 : 25,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => tooMany(req, res),
});

/**
 * Refresh / logout — higher volume; do not count 4xx so anonymous or stale-session traffic
 * does not share the same budget as credential stuffing.
 */
export const refreshAndLogoutLimiter = rateLimit({
  windowMs: windowMs15,
  max: isDev ? 200 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  handler: (req, res) => tooMany(req, res),
});

/** Email verification and password reset token submission — per IP. */
export const authTokenFlowLimiter = rateLimit({
  windowMs: windowMs15,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => tooMany(req, res),
});

/** Forgot-password — stricter (enumeration / mail abuse). */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => tooMany(req, res),
});
