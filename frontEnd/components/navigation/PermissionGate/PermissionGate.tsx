"use client";

import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import type { AuthUser } from "@/types/auth";

export interface PermissionGateProps {
  permission: string;
  user?: AuthUser | null;
  /** When omitted, uses useAuth().user */
  fallback: ReactNode;
  children: ReactNode;
}

export function PermissionGate({ permission, user: userProp, fallback, children }: PermissionGateProps) {
  const { user: authUser } = useAuth();
  const user = userProp !== undefined ? userProp : authUser;
  if (!can(user, permission)) return <>{fallback}</>;
  return <>{children}</>;
}
