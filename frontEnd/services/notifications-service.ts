/**
 * In-app notifications API.
 */

import { apiGet, apiPatch, apiPost } from "./api-client";
import type { AppNotification } from "@/types/notifications";
import type { ApiResponse } from "@/types/api";

function buildQuery(params: { limit?: number; unread_only?: boolean }): string {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.unread_only) q.set("unread_only", "true");
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function listNotifications(
  accessToken: string | null,
  params: { limit?: number; unread_only?: boolean } = {}
): Promise<ApiResponse<AppNotification[]>> {
  return apiGet<AppNotification[]>(`notifications${buildQuery(params)}`, accessToken);
}

export async function markNotificationRead(
  id: string,
  accessToken: string | null
): Promise<ApiResponse<{ id: string }>> {
  return apiPatch<{ id: string }>(`notifications/${id}/read`, {}, accessToken);
}

export async function markAllNotificationsRead(
  accessToken: string | null
): Promise<ApiResponse<{ marked: number }>> {
  return apiPost<{ marked: number }>("notifications/read-all", {}, accessToken);
}
