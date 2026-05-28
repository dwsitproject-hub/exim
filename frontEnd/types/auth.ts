/**
 * Auth types — align with backend auth API (POST /auth/login, GET /auth/me).
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  permission_overrides: string[];
  effective_permissions: string[];
}

export interface LoginResponseData {
  /** Omitted when tokens are only in HttpOnly cookies. */
  access_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface RefreshResponseData {
  access_token?: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}
