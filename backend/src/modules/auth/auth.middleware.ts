/**
 * Auth middleware: verify JWT, load user from DB (fresh role/permissions), attach req.user.
 * Access token: Authorization Bearer or HttpOnly cookie `eos_access`.
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config/index.js";
import { sendError } from "../../shared/response.js";
import { ACCESS_TOKEN_COOKIE } from "./auth-cookies.js";
import { userRowToAuthUser } from "./auth-user-mapper.js";
import { UserRepository } from "./repositories/user.repository.js";
import type { AccessTokenPayload } from "./dto/index.js";

const userRepo = new UserRepository();

function getAccessTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  const c = req.cookies?.[ACCESS_TOKEN_COOKIE];
  return typeof c === "string" && c.trim() ? c.trim() : null;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    sendError(res, "Missing or invalid authorization header", { statusCode: 401 });
    return;
  }

  const secret = config.jwt.accessSecret;
  if (!secret) {
    sendError(res, "Authentication not configured", { statusCode: 500 });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AccessTokenPayload;
    if (payload.type !== "access" || !payload.sub) {
      sendError(res, "Invalid token", { statusCode: 401 });
      return;
    }

    void (async () => {
      try {
        if (res.writableEnded || res.headersSent) return;
        const row = await userRepo.findById(payload.sub);
        if (!row) {
          if (res.writableEnded || res.headersSent) return;
          sendError(res, "Invalid or expired token", { statusCode: 401 });
          return;
        }
        if (res.writableEnded || res.headersSent) return;
        req.user = userRowToAuthUser(row);
        next();
      } catch (e) {
        if (!res.writableEnded && !res.headersSent) {
          next(e);
        }
      }
    })();
  } catch {
    sendError(res, "Invalid or expired token", { statusCode: 401 });
  }
}
