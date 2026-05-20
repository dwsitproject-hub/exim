import { apiGet, apiPost, apiPatch, apiDelete } from "./api-client";
import type { ApiResponse } from "@/types/api";

export interface Shipper {
  id: string;
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

/* ───────── shippers ───────── */

export async function listShippers(
  accessToken: string | null,
  search?: string,
): Promise<ApiResponse<Shipper[]>> {
  const q = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return apiGet<Shipper[]>(`shippers${q}`, accessToken);
}

export async function getShipper(
  id: string,
  accessToken: string | null,
): Promise<ApiResponse<Shipper>> {
  return apiGet<Shipper>(`shippers/${id}`, accessToken);
}

export async function createShipper(
  body: { name: string },
  accessToken: string | null,
): Promise<ApiResponse<Shipper>> {
  return apiPost<Shipper>("shippers", body, accessToken);
}

export async function updateShipper(
  id: string,
  body: { name: string },
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

/* ───────── shipper loadports ───────── */

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
  body: { name: string },
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
