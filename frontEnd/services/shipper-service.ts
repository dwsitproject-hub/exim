import { apiGet, apiPost, apiPatch, apiDelete, apiRequest } from "./api-client";
import type { ApiResponse } from "@/types/api";
import { config } from "@/lib/config";
import { COOKIE_AUTH_SENTINEL } from "@/lib/constants";
import { getAccessToken } from "@/lib/cookies";

export interface Shipper {
  id: string;
  entity_name: string;
  short_name: string;
  /** Legacy; mirrors short_name. */
  name: string;
  has_document_header: boolean;
  document_header_file_name: string | null;
  document_header_mime_type: string | null;
  npwp: string | null;
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

export interface ShipperPlantUnloadPort {
  id: string;
  plant_id: string;
  name: string;
  /** Linked JPS port id from partner GET /ports; null = not connected. */
  jps_port_id: number | null;
  created_at: string;
  updated_at: string;
}

/** All plant unload ports (import destination master). */
export interface ShipperPlantUnloadPortListItem {
  id: string;
  plant_id: string;
  plant_name: string;
  shipper_id: string;
  shipper_short_name: string;
  name: string;
  jps_port_id: number | null;
}

/** Plant unload ports linked to Jetty for import berth planning. */
export interface ShipperPlantUnloadPortJpsMapped {
  id: string;
  plant_id: string;
  plant_name: string;
  shipper_id: string;
  shipper_short_name: string;
  name: string;
  jps_port_id: number;
}

export interface ShipperLoadport {
  id: string;
  shipper_id: string;
  name: string;
  /** Linked JPS port id from partner GET /ports; null = not connected. */
  jps_port_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ShipperLoadportJpsMapped {
  id: string;
  shipper_id: string;
  shipper_short_name: string;
  name: string;
  jps_port_id: number;
}

export interface ShipperInput {
  entity_name: string;
  short_name: string;
  npwp?: string | null;
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

/* ───────── plant unload ports (import) ───────── */

export async function listShipperPlantUnloadPorts(
  plantId: string,
  accessToken: string | null,
): Promise<ApiResponse<ShipperPlantUnloadPort[]>> {
  return apiGet<ShipperPlantUnloadPort[]>(`shippers/plants/${plantId}/unload-ports`, accessToken);
}

export async function createShipperPlantUnloadPort(
  plantId: string,
  body: { name: string; jps_port_id?: number | null },
  accessToken: string | null,
): Promise<ApiResponse<ShipperPlantUnloadPort>> {
  return apiPost<ShipperPlantUnloadPort>(
    `shippers/plants/${plantId}/unload-ports`,
    body,
    accessToken,
  );
}

export async function updateShipperPlantUnloadPort(
  unloadPortId: string,
  body: { name?: string; jps_port_id?: number | null },
  accessToken: string | null,
): Promise<ApiResponse<ShipperPlantUnloadPort>> {
  return apiPatch<ShipperPlantUnloadPort>(
    `shippers/unload-ports/${unloadPortId}`,
    body,
    accessToken,
  );
}

export async function deleteShipperPlantUnloadPort(
  unloadPortId: string,
  accessToken: string | null,
): Promise<ApiResponse<unknown>> {
  return apiDelete(`shippers/unload-ports/${unloadPortId}`, accessToken);
}

/** All active plant unload ports (destination master for import). */
export async function listAllUnloadPorts(
  accessToken: string | null,
): Promise<ApiResponse<ShipperPlantUnloadPortListItem[]>> {
  return apiGet<ShipperPlantUnloadPortListItem[]>("shippers/unload-ports", accessToken);
}

/** EOS plant unload ports that admin linked to a JPS port. */
export async function listJpsMappedUnloadPorts(
  accessToken: string | null,
): Promise<ApiResponse<ShipperPlantUnloadPortJpsMapped[]>> {
  return apiGet<ShipperPlantUnloadPortJpsMapped[]>("shippers/unload-ports/jps-mapped", accessToken);
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

export async function updateShipperLoadport(
  lpId: string,
  body: { name?: string; jps_port_id?: number | null },
  accessToken: string | null,
): Promise<ApiResponse<ShipperLoadport>> {
  return apiPatch<ShipperLoadport>(`shippers/loadports/${lpId}`, body, accessToken);
}

export async function deleteShipperLoadport(
  lpId: string,
  accessToken: string | null,
): Promise<ApiResponse<unknown>> {
  return apiDelete(`shippers/loadports/${lpId}`, accessToken);
}

/** EOS master shipper load ports that admin linked to a JPS port. */
export async function listJpsMappedLoadports(
  accessToken: string | null,
): Promise<ApiResponse<ShipperLoadportJpsMapped[]>> {
  return apiGet<ShipperLoadportJpsMapped[]>("shippers/loadports/jps-mapped", accessToken);
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

/** NPWP from shipper master for export shipping instructions. */
export function resolveShipperNpwp(
  shipperShortName: string | null | undefined,
  shippers: Shipper[],
): string {
  return findShipperMatch(shipperShortName, shippers)?.npwp?.trim() ?? "";
}

export function shipperShortNameOptions(shippers: Shipper[]): string[] {
  return shippers.map((s) => s.short_name);
}

/* ───────── document header ───────── */

export function uploadShipperDocumentHeader(
  shipperId: string,
  file: File,
  accessToken: string | null,
): Promise<ApiResponse<Shipper>> {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<Shipper>(`shippers/${shipperId}/document-header`, {
    method: "POST",
    body: form,
    accessToken,
  });
}

export function deleteShipperDocumentHeader(
  shipperId: string,
  accessToken: string | null,
): Promise<ApiResponse<Shipper>> {
  return apiDelete<Shipper>(`shippers/${shipperId}/document-header`, accessToken);
}

/** Authenticated blob fetch for shipper document header preview or export documents. */
export async function fetchShipperDocumentHeaderBlob(
  shipperId: string,
  accessToken: string | null,
): Promise<Blob> {
  const base = config.apiBaseUrl.replace(/\/$/, "");
  const url = `${base}/shippers/${shipperId}/document-header`;
  const headers: Record<string, string> = {};
  const token =
    accessToken && accessToken !== COOKIE_AUTH_SENTINEL
      ? accessToken
      : typeof window !== "undefined"
        ? getAccessToken()
        : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  const fetchHeader = () => fetch(url, { credentials: "include", headers });

  let response = await fetchHeader();
  if (response.status === 401) {
    const refresh = await fetch(`${base}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      credentials: "include",
    });
    if (!refresh.ok) throw new Error("Failed to load document header");
    response = await fetchHeader();
  }
  if (!response.ok) throw new Error("Failed to load document header");
  return response.blob();
}
