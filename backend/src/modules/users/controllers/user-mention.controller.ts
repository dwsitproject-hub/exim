/**
 * User mention autocomplete — active users (VIEW_SHIPMENTS), for @mentions in shipment notes.
 */

import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../../shared/response.js";
import { UserRepository } from "../../auth/repositories/user.repository.js";

const userRepo = new UserRepository();

export async function listMentionable(req: Request, res: Response, next: NextFunction): Promise<void> {
  const q = req.query as Record<string, unknown>;
  const search = typeof q.q === "string" ? q.q : undefined;
  const limitRaw = q.limit != null ? parseInt(String(q.limit), 10) : 20;
  const limit = Number.isNaN(limitRaw) ? 20 : limitRaw;
  try {
    const items = await userRepo.listActiveForMentionSearch(search, limit);
    sendSuccess(res, items);
  } catch (e) {
    next(e);
  }
}
