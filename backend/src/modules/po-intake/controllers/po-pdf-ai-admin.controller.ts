/**
 * Admin: PO PDF AI usage audit log.
 */

import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/response.js";
import { PoPdfAiRequestRepository } from "../repositories/po-pdf-ai-request.repository.js";

const repo = new PoPdfAiRequestRepository();

function parseListQuery(req: Request): { page?: number; limit?: number } {
  const q = req.query as Record<string, unknown>;
  const page = q.page != null ? parseInt(String(q.page), 10) : undefined;
  const limit = q.limit != null ? parseInt(String(q.limit), 10) : undefined;
  return {
    page: Number.isNaN(page) ? undefined : page,
    limit: Number.isNaN(limit) ? undefined : limit,
  };
}

export async function listPdfAiRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page, limit } = parseListQuery(req);
    const { rows, total } = await repo.listForAdmin({ page, limit });
    const effectiveLimit = Math.min(100, Math.max(1, limit ?? 20));
    const effectivePage = Math.max(1, page ?? 1);

    sendSuccess(res, rows, {
      meta: {
        page: effectivePage,
        limit: effectiveLimit,
        total,
      },
    });
  } catch (err) {
    next(err);
  }
}
