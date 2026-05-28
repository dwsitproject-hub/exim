/**
 * Admin users API — /users (MANAGE_USERS).
 */

import { apiGet, apiPost, apiPatch, apiRequest } from "./api-client";
import type { MentionableUser, UserAdmin, UserImportResult } from "@/types/users";
import type { ApiResponse } from "@/types/api";

function buildQuery(params: { search?: string; page?: number; limit?: number }): string {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.page != null) q.set("page", String(params.page));
  if (params.limit != null) q.set("limit", String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

function mentionableQuery(params: { q?: string; limit?: number }): string {
  const q = new URLSearchParams();
  if (params.q != null && params.q.trim()) q.set("q", params.q.trim());
  if (params.limit != null) q.set("limit", String(params.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function listUsers(
  params: { search?: string; page?: number; limit?: number },
  accessToken: string | null
): Promise<ApiResponse<UserAdmin[]>> {
  return apiGet<UserAdmin[]>(`users${buildQuery(params)}`, accessToken);
}

/** Active users for @mentions (requires VIEW_SHIPMENTS). */
export async function listMentionableUsers(
  params: { q?: string; limit?: number },
  accessToken: string | null
): Promise<ApiResponse<MentionableUser[]>> {
  return apiGet<MentionableUser[]>(`users/mentionable${mentionableQuery(params)}`, accessToken);
}

export async function getUser(id: string, accessToken: string | null): Promise<ApiResponse<UserAdmin>> {
  return apiGet<UserAdmin>(`users/${id}`, accessToken);
}

export async function createUser(
  body: {
    name: string;
    email: string;
    password: string;
    role: string;
    permission_overrides?: string[];
  },
  accessToken: string | null
): Promise<ApiResponse<UserAdmin>> {
  return apiPost<UserAdmin>("users", body, accessToken);
}

export async function patchUser(
  id: string,
  body: {
    name?: string;
    role?: string;
    is_active?: boolean;
    permission_overrides?: string[];
    password?: string;
  },
  accessToken: string | null
): Promise<ApiResponse<UserAdmin>> {
  return apiPatch<UserAdmin>(`users/${id}`, body, accessToken);
}

export async function importUsersCsv(
  file: File,
  accessToken: string | null
): Promise<ApiResponse<UserImportResult>> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<UserImportResult>("users/import", {
    method: "POST",
    body: form,
    accessToken,
  });
}
