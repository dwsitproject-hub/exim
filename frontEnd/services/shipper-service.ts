import { apiGet, apiPost, apiPatch, apiDelete } from "./api-client";
import type { ApiResponse } from "@/types/api";

export interface Shipper {
  id: string;
  entity_name: string;
  short_name: string;
  /** Legacy; mirrors short_name. */
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ShipperMaster extends Shipper {
  plants: string[];
  loadports: string[];
}

export interface ShipperPlant {
  id: string;
  shipper_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ShipperLoadport {
  id: string;
  shipper_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ShipperInput {
  entity_name: string;
  short_name: string;
}

/* ───────── shippers ───────── */

export async function listShippers(
  accessToken: string | null,
  search?: string,
): Promise<ApiResponse<Shipper[]>> {
  const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return apiGet<Shipper[]>(`shippers${q}`, accessToken);
}

export async function listShippersMaster(
  accessToken: string | null,
  search?: string,
): Promise<ApiResponse<ShipperMaster[]>> {
  const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return apiGet<ShipperMaster[]>(`shippers/master${q}`, accessToken);
}

export async function getShipper(
  id: string,
  accessToken: string | null,
): Promise<ApiResponse<Shipper>> {
  return apiGet<Shipper>(`shippers/${id}`, accessToken);
}

export async function createShipper(
  body: ShipperInput,
  accessToken: string | null,
): Promise<ApiResponse<Shipper>> {
  return apiPost<Shipper>("shippers", body, accessToken);
}

export async function updateShipper(
  id: string,
  body: ShipperInput,
  accessToken: string | null,
): Promise<ApiResponse<Shipper>> {
  return apiPatch<Shipper>(`shippers/${id}`, body, accessToken);
}

export async function deleteShipper(
  id: string,
  accessToken: string | null,
): Promise<ApiResponse<unknown>> {
  return apiDelete(`shippers/${id}`, accessToken);
}

/* ───────── plants ───────── */

export async function listShipperPlants(
  shipperId: string,
  accessToken: string | null,
): Promise<ApiResponse<ShipperPlant[]>> {
  return apiGet<ShipperPlant[]>(`shippers/${shipperId}/plants`, accessToken);
}

export async function createShipperPlant(
  shipperId: string,
  body: { name: string },
  accessToken: string | null,
): Promise<ApiResponse<ShipperPlant>> {
  return apiPost<ShipperPlant>(`shippers/${shipperId}/plants`, body, accessToken);
}

export async function deleteShipperPlant(
  plantId: string,
  accessToken: string | null,
): Promise<ApiResponse<unknown>> {
  return apiDelete(`shippers/plants/${plantId}`, accessToken);
}

/* ───────── loadports ───────── */

export async function listShipperLoadports(
  shipperId: string,
  accessToken: string | null,
): Promise<ApiResponse<ShipperLoadport[]>> {
  return apiGet<ShipperLoadport[]>(`shippers/${shipperId}/loadports`, accessToken);
}

export async function createShipperLoadport(
  shipperId: string,
  body: { name: string },
  accessToken: string | null,
): Promise<ApiResponse<ShipperLoadport>> {
  return apiPost<ShipperLoadport>(`shippers/${shipperId}/loadports`, body, accessToken);
}

export async function deleteShipperLoadport(
  lpId: string,
  accessToken: string | null,
): Promise<ApiResponse<unknown>> {
  return apiDelete(`shippers/loadports/${lpId}`, accessToken);
}

/** Match stored PT/shipper value to a master row (short name, entity name, or legacy name). */
export function findShipperMasterMatch(
  value: string | null | undefined,
  masters: ShipperMaster[],
): ShipperMaster | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return (
    masters.find((m) => m.short_name.toLowerCase() === lower) ??
    masters.find((m) => m.entity_name.toLowerCase() === lower) ??
    masters.find((m) => m.name.toLowerCase() === lower) ??
    null
  );
}

export function resolveShipperShortName(
  value: string | null | undefined,
  masters: ShipperMaster[],
): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return findShipperMasterMatch(trimmed, masters)?.short_name ?? trimmed;
}

export function getPlantsForShortName(masters: ShipperMaster[], shortName: string): string[] {
  const match = findShipperMasterMatch(shortName, masters);
  return match?.plants ?? [];
}

export function getLoadportsForShortName(masters: ShipperMaster[], shortName: string): string[] {
  const match = findShipperMasterMatch(shortName, masters);
  return match?.loadports ?? [];
}

export function getAllPlantsFromMasters(masters: ShipperMaster[]): string[] {
  const set = new Set<string>();
  for (const m of masters) {
    for (const p of m.plants) set.add(p);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export function getPtShortNameOptions(masters: ShipperMaster[]): string[] {
  return masters.map((m) => m.short_name);
}

export function formatPtOptionLabel(shortName: string, masters: ShipperMaster[]): string {
  const match = findShipperMasterMatch(shortName, masters);
  if (!match || match.short_name === match.entity_name) return shortName;
  return `${match.short_name} — ${match.entity_name}`;
}

/** Match stored shipper/PT value to a shipper row (short name, entity name, or legacy name). */
export function findShipperMatch(
  value: string | null | undefined,
  shippers: Shipper[],
): Shipper | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return (
    shippers.find((s) => s.short_name.toLowerCase() === lower) ??
    shippers.find((s) => s.entity_name.toLowerCase() === lower) ??
    shippers.find((s) => s.name.toLowerCase() === lower) ??
    null
  );
}

export function shipperShortNameOptions(shippers: Shipper[]): string[] {
  return shippers.map((s) => s.short_name);
}
