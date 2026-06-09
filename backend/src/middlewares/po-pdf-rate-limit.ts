/**
 * Rate limit for PO PDF parse — OCR is CPU-heavy (Python + Tesseract per page).
 */

import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { sendError } from "../shared/response.js";
import { config } from "../config/index.js";

function tooMany(_req: Request, res: Response): void {
  sendError(res, "Too many PDF parse requests. Please try again later.", { statusCode: 429 });
}

const windowMs15 = 15 * 60 * 1000;
const isDev = (config.nodeEnv ?? "development") === "development";

export const parsePdfLimiter = rateLimit({
  windowMs: windowMs15,
  max: isDev ? 60 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => tooMany(req, res),
});
