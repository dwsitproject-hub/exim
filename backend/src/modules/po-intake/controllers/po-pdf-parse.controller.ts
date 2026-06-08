/**
 * PO PDF parse controller — accepts a PDF upload, runs OCR + field extraction,
 * and returns structured pre-fill data. Does NOT create any PO records.
 */

import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";
import { readFile, unlink } from "fs/promises";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { parsePoPdf } from "../../../shared/po-pdf-parser.js";
import { logger } from "../../../utils/logger.js";

export async function parsePdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  const file = req.file;

  if (!file) {
    sendError(res, "A PDF file is required (field name: file).", { statusCode: 400 });
    return;
  }

  const mime = (file.mimetype ?? "").toLowerCase();
  const name = (file.originalname ?? "").toLowerCase();
  if (!mime.includes("pdf") && !name.endsWith(".pdf")) {
    await unlink(file.path).catch(() => undefined);
    sendError(res, "Only PDF files are supported.", { statusCode: 415 });
    return;
  }

  try {
    const fileBytes = await readFile(file.path);
    const contentHash = createHash("sha256").update(fileBytes).digest("hex");
    const userId = req.user?.id;

    const requestAi =
      req.body?.request_ai === true ||
      req.body?.request_ai === "true" ||
      req.body?.request_ai === "1";

    logger.info("PO PDF parse request", { request_ai: requestAi, user_id: userId ?? null });

    const result = await parsePoPdf(file.path, {
      contentHash,
      userId,
      requestAi,
      originalFilename: file.originalname ?? undefined,
    });
    sendSuccess(res, result, {
      message:
        result.confidence === "low"
          ? "Document scanned with low confidence — please review all fields carefully."
          : "Document scanned successfully. Review and apply the extracted data.",
    });
  } catch (err) {
    logger.error("PO PDF parse error", { error: String(err) });
    // Surface user-friendly message; underlying errors (Python missing, fitz missing) are logged.
    const msg = String(err);
    if (msg.includes("Failed to spawn Python") || msg.includes("Python")) {
      sendError(res, "OCR backend unavailable (Python / PyMuPDF not found). Contact your system administrator.", { statusCode: 503 });
    } else if (msg.includes("PDF render failed")) {
      sendError(res, "Could not read the PDF file. Please ensure it is a valid, uncorrupted PDF.", { statusCode: 422 });
    } else {
      next(err);
    }
  } finally {
    if (file?.path) {
      await unlink(file.path).catch(() => undefined);
    }
  }
}
