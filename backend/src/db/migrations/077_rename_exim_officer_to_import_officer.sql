-- Rename EXIM_OFFICER role to IMPORT_OFFICER (align with shared/rbac.ts).
-- Drop the old role check before updating rows; PostgreSQL validates CHECK on UPDATE.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_role;

UPDATE users
SET role = 'IMPORT_OFFICER'
WHERE UPPER(TRIM(role)) = 'EXIM_OFFICER';

ALTER TABLE users
  ADD CONSTRAINT chk_users_role
  CHECK (UPPER(TRIM(role)) IN ('ADMIN', 'IMPORT_OFFICER', 'VIEWER', 'DOCS'));
