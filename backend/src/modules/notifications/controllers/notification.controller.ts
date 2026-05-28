/**
 * In-app notifications — HTTP handlers.
 */

import type { Request, Response, NextFunction } from "express";
import { sendSuccess, sendError } from "../../../shared/response.js";
import { NotificationRepository } from "../repositories/notification.repository.js";
import { NotificationService } from "../services/notification.service.js";

const repo = new NotificationRepository();
const service = new NotificationService(repo);

export async function listNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    sendError(res, "Unauthorized", { statusCode: 401 });
    return;
  }
  const q = req.query as Record<string, unknown>;
  const limitRaw = q.limit != null ? parseInt(String(q.limit), 10) : 30;
  const limit = Number.isNaN(limitRaw) ? 30 : limitRaw;
  const unreadOnly = q.unread_only === "true" || q.unread_only === "1";
  try {
    const data = await service.listForUser(userId, { limit, unreadOnly });
    sendSuccess(res, data.items, { meta: { unread_count: data.unread_count } });
  } catch (e) {
    next(e);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    sendError(res, "Unauthorized", { statusCode: 401 });
    return;
  }
  const id = req.params.id as string;
  try {
    const ok = await service.markRead(userId, id);
    if (!ok) {
      sendError(res, "Notification not found", { statusCode: 404 });
      return;
    }
    sendSuccess(res, { id }, { message: "Marked as read" });
  } catch (e) {
    next(e);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    sendError(res, "Unauthorized", { statusCode: 401 });
    return;
  }
  try {
    const n = await service.markAllRead(userId);
    sendSuccess(res, { marked: n }, { message: "All notifications marked as read" });
  } catch (e) {
    next(e);
  }
}
