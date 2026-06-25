/**
 * billing-pdf-parse.controller.ts
 *
 * Handles POST /export/bulking/billing-parse
 *
 * Accepts a PDF upload and a doc_type ("biaya_keluar" | "levy"),
 * runs text extraction + field parsing, and returns structured data
 * for the frontend OCR review modal.
 */

import type { Request, Response, NextFunction } from "express";
import { unlink } from "fs/promises";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { parseBillingPdf, type BillingDocType } from "../utils/billing-pdf-parser.js";
import { logger } from "../../../utils/logger.js";

const VALID_DOC_TYPES: BillingDocType[] = ["biaya_keluar", "levy"];

function isValidDocType(v: unknown): v is BillingDocType {
  return typeof v === "string" && (VALID_DOC_TYPES as string[]).includes(v);
}

type MulterFile = Express.Multer.File;

export async function parseBillingDocument(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const file = (req as Request & { file?: MulterFile }).file;

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

  const rawDocType = req.body?.doc_type;
  if (!isValidDocType(rawDocType)) {
    await unlink(file.path).catch(() => undefined);
    sendError(
      res,
      `Invalid or missing doc_type. Accepted values: ${VALID_DOC_TYPES.join(", ")}.`,
      { statusCode: 400 },
    );
    return;
  }

  const userId = req.user?.id;
  logger.info("Billing PDF parse request", { doc_type: rawDocType, user_id: userId ?? null });

  try {
    const result = await parseBillingPdf(file.path, rawDocType);

    const message =
      result.confidence === "low"
        ? "Document scanned with low confidence — please verify all fields."
        : result.confidence === "medium"
          ? "Document scanned. Some fields could not be detected — please review carefully."
          : "Document scanned successfully. Review and apply the extracted data.";

    sendSuccess(res, result, { message });
  } catch (err) {
    logger.error("Billing PDF parse error", {
      error: String(err),
      doc_type: rawDocType,
      file: file.originalname,
    });

    const msg = String(err);
    if (msg.includes("Failed to spawn Python") || msg.includes("Python")) {
      sendError(
        res,
        "OCR backend unavailable (Python / PyMuPDF not found). Contact your system administrator.",
        { statusCode: 503 },
      );
    } else {
      next(err);
    }
  } finally {
    await unlink(file.path).catch(() => undefined);
  }
}
