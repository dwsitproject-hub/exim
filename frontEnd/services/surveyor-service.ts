import { apiGet, apiPost, apiPatch, apiDelete } from "./api-client";
import type { ApiResponse } from "@/types/api";

export interface Surveyor {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export async function listSurveyors(
  accessToken: string | null,
  search?: string,
): Promise<ApiResponse<Surveyor[]>> {
  const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return apiGet<Surveyor[]>(`surveyors${q}`, accessToken);
}

export async function getSurveyor(
  id: string,
  accessToken: string | null,
): Promise<ApiResponse<Surveyor>> {
  return apiGet<Surveyor>(`surveyors/${id}`, accessToken);
}

export async function createSurveyor(
  body: { name: string },
  accessToken: string | null,
): Promise<ApiResponse<Surveyor>> {
  return apiPost<Surveyor>("surveyors", body, accessToken);
}

export async function updateSurveyor(
  id: string,
  body: { name: string },
  accessToken: string | null,
): Promise<ApiResponse<Surveyor>> {
  return apiPatch<Surveyor>(`surveyors/${id}`, body, accessToken);
}

export async function deleteSurveyor(
  id: string,
  accessToken: string | null,
): Promise<ApiResponse<unknown>> {
  return apiDelete(`surveyors/${id}`, accessToken);
}
