import { apiGet, apiPost, apiPatch, apiDelete } from "./api-client";
import type { ApiResponse } from "@/types/api";

export interface Agent {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export async function listAgents(
  accessToken: string | null,
  search?: string,
): Promise<ApiResponse<Agent[]>> {
  const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return apiGet<Agent[]>(`agents${q}`, accessToken);
}

export async function getAgent(
  id: string,
  accessToken: string | null,
): Promise<ApiResponse<Agent>> {
  return apiGet<Agent>(`agents/${id}`, accessToken);
}

export async function createAgent(
  body: { name: string },
  accessToken: string | null,
): Promise<ApiResponse<Agent>> {
  return apiPost<Agent>("agents", body, accessToken);
}

export async function updateAgent(
  id: string,
  body: { name: string },
  accessToken: string | null,
): Promise<ApiResponse<Agent>> {
  return apiPatch<Agent>(`agents/${id}`, body, accessToken);
}

export async function deleteAgent(
  id: string,
  accessToken: string | null,
): Promise<ApiResponse<unknown>> {
  return apiDelete(`agents/${id}`, accessToken);
}
