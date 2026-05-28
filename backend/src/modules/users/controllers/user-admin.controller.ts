/**
 * Admin user HTTP handlers.
 */

import type { Request, Response, NextFunction } from "express";
import { randomBytes } from "crypto";
import multer from "multer";
import { tmpdir } from "os";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { readMulterFileAsUtf8 } from "../../../utils/read-multer-upload.js";
import { UserRepository } from "../../auth/repositories/user.repository.js";
import { AuthService } from "../../auth/services/auth.service.js";
import { RefreshTokenRepository } from "../../auth/repositories/refresh-token.repository.js";
import { EmailVerificationTokenRepository } from "../../auth/repositories/email-verification-token.repository.js";
import { PasswordResetTokenRepository } from "../../auth/repositories/password-reset-token.repository.js";
import { UserAdminService } from "../services/user-admin.service.js";
import { validateCreateUserBody, validatePatchUserBody } from "../validators/user-admin.validator.js";

const userRepo = new UserRepository();
const refreshTokenRepo = new RefreshTokenRepository();
const verificationTokenRepo = new EmailVerificationTokenRepository();
const passwordResetTokenRepo = new PasswordResetTokenRepository();
const authService = new AuthService(userRepo, refreshTokenRepo, verificationTokenRepo, passwordResetTokenRepo);
const userAdminService = new UserAdminService(userRepo, authService);

const userImportDisk = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, tmpdir()),
  filename: (_req, file, cb) =>
    cb(null, `${randomBytes(16).toString("hex")}_${(file.originalname || "upload").replace(/[^a-zA-Z0-9._-]/g, "_")}`),
});

/** Disk temp (same pattern as shipment uploads); CSV text is read then temp file removed. */
export const userImportUpload = multer({
  storage: userImportDisk,
  limits: { fileSize: 2 * 1024 * 1024 },
});

function parseListQuery(req: Request): { search?: string; page?: number; limit?: number } {
  const q = req.query as Record<string, unknown>;
  const page = q.page != null ? parseInt(String(q.page), 10) : undefined;
  const limit = q.limit != null ? parseInt(String(q.limit), 10) : undefined;
  return {
    search: typeof q.search === "string" ? q.search : undefined,
    page: Number.isNaN(page) ? undefined : page,
    limit: Number.isNaN(limit) ? undefined : limit,
  };
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items, meta } = await userAdminService.list(parseListQuery(req));
    sendSuccess(res, items, { meta, message: "OK", statusCode: 200 });
  } catch (e) {
    next(e);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const row = await userAdminService.getById(req.params.id ?? "");
    if (!row) {
      sendError(res, "User not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row, { statusCode: 200 });
  } catch (e) {
    next(e);
  }
}

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validateCreateUserBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  try {
    const data = await userAdminService.create(validation.data);
    sendSuccess(res, data, { message: "User created", statusCode: 201 });
  } catch (e) {
    next(e);
  }
}

export async function patch(req: Request, res: Response, next: NextFunction): Promise<void> {
  const validation = validatePatchUserBody(req);
  if (!validation.ok) {
    sendError(res, "Validation error", { errors: validation.errors, statusCode: 400 });
    return;
  }
  const actorId = req.user?.id;
  if (!actorId) {
    sendError(res, "Unauthorized", { statusCode: 401 });
    return;
  }
  try {
    const row = await userAdminService.update(req.params.id ?? "", actorId, validation.data);
    if (!row) {
      sendError(res, "User not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, row, { message: "User updated", statusCode: 200 });
  } catch (e) {
    next(e);
  }
}

/** Multipart file `file` and/or JSON body field `csv_text`. */
export async function importCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
  let csvText = "";
  const file = req.file;
  if (file) csvText = await readMulterFileAsUtf8(file);
  else if (typeof req.body?.csv_text === "string") csvText = req.body.csv_text;
  if (!csvText.trim()) {
    sendError(res, 'Upload a CSV file (field "file") or send JSON { "csv_text": "..." }', { statusCode: 400 });
    return;
  }
  try {
    const result = await userAdminService.importFromCsv(csvText);
    sendSuccess(res, result, { message: "Import finished", statusCode: 200 });
  } catch (e) {
    next(e);
  }
}
