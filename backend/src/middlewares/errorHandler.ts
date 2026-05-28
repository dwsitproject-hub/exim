/**
 * Centralized error handling middleware (cursor-rules §12).
 * Does not leak stack traces in production.
 */

import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { sendError } from "../shared/response.js";
import { logger } from "../utils/logger.js";
import { config } from "../config/index.js";

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public errors?: { field: string; message: string }[]
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Map Multer errors to user-facing messages (400). */
function multerErrorMessage(code: string): string {
  switch (code) {
    case "LIMIT_FILE_SIZE":
      return "File size exceeds the allowed limit (10 MB)";
    case "LIMIT_FILE_COUNT":
      return "Too many files";
    case "LIMIT_UNEXPECTED_FILE":
      return "Unexpected file field";
    default:
      return "File upload error";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (res.headersSent) {
    return;
  }

  if (err instanceof multer.MulterError) {
    const message = multerErrorMessage(err.code);
    sendError(res, message, { statusCode: 400 });
    return;
  }

  if (err instanceof AppError) {
    sendError(res, err.message, { errors: err.errors, statusCode: err.statusCode });
    if (err.statusCode >= 500) {
      logger.error(err.message, { statusCode: err.statusCode });
    }
    return;
  }

  /** Only true local dev should return raw error messages; staging/deployment must not leak internals. */
  const isDev = config.nodeEnv === "development";
  const message = err instanceof Error ? err.message : "Internal server error";
  const statusCode = 500;

  logger.error(message, {
    ...(err instanceof Error && isDev && { stack: err.stack }),
  });

  sendError(res, isDev ? message : "Internal server error", { statusCode });
}
