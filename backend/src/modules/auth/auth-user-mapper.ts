/**
 * Map DB user row → AuthUser. Single source for RBAC fields (used by AuthService and auth middleware).
 */

import { computeEffectivePermissions, normalizePermissionOverrides } from "../../shared/rbac.js";
import type { AuthUser } from "./dto/index.js";
import type { UserRow } from "./dto/index.js";

export function userRowToAuthUser(row: UserRow): AuthUser {
  const permission_overrides = normalizePermissionOverrides(row.permission_overrides);
  const effective_permissions = [...computeEffectivePermissions(row.role, permission_overrides)];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    permission_overrides,
    effective_permissions,
  };
}
