import { apiGet, apiPost, apiPatch, apiDelete } from "./api-client";
import type { ApiResponse } from "@/types/api";

export const COMMODITY_TYPES = ["Liquid", "Solid"] as const;

export type CommodityType = (typeof COMMODITY_TYPES)[number];

export interface Commodity {
  id: string;
  short_name: string;
  name: string;
  commodity_type: CommodityType;
  created_at: string;
  updated_at: string;
}

export interface CommodityInput {
  short_name: string;
  name: string;
  commodity_type: CommodityType;
}

export async function listCommodities(
  accessToken: string | null,
  search?: string,
): Promise<ApiResponse<Commodity[]>> {
  const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return apiGet<Commodity[]>(`commodities${q}`, accessToken);
}

export async function getCommodity(
  id: string,
  accessToken: string | null,
): Promise<ApiResponse<Commodity>> {
  return apiGet<Commodity>(`commodities/${id}`, accessToken);
}

export async function createCommodity(
  body: CommodityInput,
  accessToken: string | null,
): Promise<ApiResponse<Commodity>> {
  return apiPost<Commodity>("commodities", body, accessToken);
}

export async function updateCommodity(
  id: string,
  body: CommodityInput,
  accessToken: string | null,
): Promise<ApiResponse<Commodity>> {
  return apiPatch<Commodity>(`commodities/${id}`, body, accessToken);
}

export async function deleteCommodity(
  id: string,
  accessToken: string | null,
): Promise<ApiResponse<unknown>> {
  return apiDelete(`commodities/${id}`, accessToken);
}

/** Resolve a cargo-line value to the master short name when possible. */
export function findCommodityMatch(
  value: string | null | undefined,
  list: Commodity[],
): Commodity | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return (
    list.find((c) => c.short_name.toLowerCase() === lower) ??
    list.find((c) => c.name.toLowerCase() === lower) ??
    null
  );
}

export function resolveCommodityShortName(value: string, list: Commodity[]): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return findCommodityMatch(trimmed, list)?.short_name ?? trimmed;
}

export function formatCommodityDescriptionOption(c: Commodity): string {
  const name = c.name.trim();
  const short = c.short_name.trim();
  if (!short || short === name) return name;
  return `${name} (${short})`;
}

/** Commodity full names for description-of-goods dropdowns. */
export function getCommodityDescriptionOptions(list: Commodity[]): string[] {
  const set = new Set<string>();
  for (const item of list) {
    const label = formatCommodityDescriptionOption(item).trim();
    if (label) set.add(label);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function resolveCommodityDescription(value: string, list: Commodity[]): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return resolveCommodityFromDescriptionOption(trimmed, list)?.name ?? trimmed;
}

export function resolveCommodityFromDescriptionOption(
  value: string,
  list: Commodity[],
): Commodity | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return (
    findCommodityMatch(trimmed, list) ??
    list.find((c) => formatCommodityDescriptionOption(c) === trimmed) ??
    null
  );
}

export function commodityDescriptionFieldValue(
  itemDescription: string,
  list: Commodity[],
): string {
  const trimmed = itemDescription.trim();
  if (!trimmed) return "";
  const match = findCommodityMatch(trimmed, list);
  return match ? formatCommodityDescriptionOption(match) : trimmed;
}

export function buildCommodityDescriptionOptions(
  list: Commodity[],
  extraValues: readonly string[] = [],
): string[] {
  const set = new Set(getCommodityDescriptionOptions(list));
  for (const value of extraValues) {
    const trimmed = value.trim();
    if (trimmed) {
      set.add(commodityDescriptionFieldValue(trimmed, list));
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
