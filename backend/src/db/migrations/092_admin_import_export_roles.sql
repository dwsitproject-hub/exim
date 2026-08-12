-- Admin import / export roles and segregated master-data permissions.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_role;

ALTER TABLE users
  ADD CONSTRAINT chk_users_role
  CHECK (
    UPPER(TRIM(role)) IN (
      'ADMIN',
      'ADMIN_IMPORT',
      'ADMIN_EXPORT',
      'IMPORT_OFFICER',
      'VIEWER',
      'DOCS',
      'EXPORT_BULKING_OPERATION',
      'EXPORT_BULKING_LEAD_DOCUMENTATION',
      'EXPORT_BULKING_DOCUMENTATION'
    )
  );
