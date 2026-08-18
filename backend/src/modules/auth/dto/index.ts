/**
 * Auth DTOs and shared types (API Spec §5.1).
 */

/** User shape returned in login, refresh, and GET /auth/me (no password). */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  /** Extra API permissions beyond the role matrix (validated keys only). */
  permission_overrides: string[];
  /** Role permissions ∪ overrides. */
  effective_permissions: string[];
}

/** Login request body. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Login success response data. */
export interface LoginResponseData {
  access_token: string;
  refresh_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: AuthUser;
}

/** Refresh request body. */
export interface RefreshRequest {
  refresh_token: string;
}

/** Refresh success response data. */
export interface RefreshResponseData {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  user: AuthUser;
}

/** JWT access token payload (encoded, not stored). */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  name?: string;
  role: string;
  permission_overrides?: string[];
  type: "access";
  iat?: number;
  exp?: number;
}

/** DB user row (repository layer). */
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  is_active: boolean;
  email_verified_at: Date | null;
  /** DWS Hub OIDC subject; null until linked via SSO. */
  oidc_sub: string | null;
  permission_overrides: string[] | null;
  created_at: Date;
  updated_at: Date;
}

/** DB refresh_token row. */
export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}
