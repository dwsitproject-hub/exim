"use client";

import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";

/**
 * Waits for auth hydration before reporting denied — avoids false AccessDenied
 * while user/effective_permissions are still loading.
 */
export function usePermissionGate(permission: string) {
  const { user, accessToken, loading, initialized } = useAuth();
  const allowed = can(user, permission);
  const pending = !initialized || loading;
  const denied = initialized && !loading && !allowed;

  return { user, accessToken, allowed, pending, denied };
}
