-- DWS Hub OIDC: stable subject for SSO user linking (not email).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS oidc_sub VARCHAR(255) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oidc_sub
  ON users (oidc_sub)
  WHERE oidc_sub IS NOT NULL;
