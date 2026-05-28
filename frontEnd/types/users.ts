/**
 * Admin users API types — align with GET/PATCH /users.
 */

export interface UserAdmin {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  email_verified_at: string | null;
  permission_overrides: string[];
  effective_permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface UserImportResult {
  created: number;
  errors: { row: number; email?: string; message: string }[];
}

/** GET /users/mentionable — active users for @mentions (VIEW_SHIPMENTS). */
export interface MentionableUser {
  id: string;
  name: string;
  email: string;
}
