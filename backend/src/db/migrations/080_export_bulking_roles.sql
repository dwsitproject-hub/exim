-- Add export-bulking-specific roles (align with shared/rbac.ts).

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_role;

ALTER TABLE users
  ADD CONSTRAINT chk_users_role
  CHECK (
    UPPER(TRIM(role)) IN (
      'ADMIN',
      'IMPORT_OFFICER',
      'VIEWER',
      'DOCS',
      'EXPORT_BULKING_OPERATION',
      'EXPORT_BULKING_LEAD_DOCUMENTATION',
      'EXPORT_BULKING_DOCUMENTATION'
    )
  );
