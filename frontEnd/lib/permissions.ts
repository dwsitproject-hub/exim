/**
 * Client-side permission checks using effective_permissions from auth API.
 */

import type { AuthUser } from "@/types/auth";

export function can(user: AuthUser | null | undefined, permission: string): boolean {
  return Boolean(user?.effective_permissions?.includes(permission));
}

export function isAdminRole(user: AuthUser | null | undefined): boolean {
  return user?.role?.trim().toUpperCase() === "ADMIN";
}
