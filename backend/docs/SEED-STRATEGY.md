# Seed strategy (admin user)

## Overview

EOS auth requires at least one user to log in. This document suggests how to seed an initial **admin** user without storing plain-text passwords.

## Assumptions

- Table `users` exists (see `src/db/migrations/001_auth_tables.sql`).
- Role names align with API Spec / RBAC (e.g. `ADMIN`, `IMPORT_OFFICER`, `VIEWER`).
- Seed is run once (e.g. after first migration) or via a dedicated script; not on every app start in production.

## Recommended approach

1. **Do not** store the admin password in source code or in migrations.
2. **Option A – env-based seed (development)**
   - Read `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from env (only when `NODE_ENV=development` or `RUN_SEED=true`).
   - If present, hash the password with bcrypt (same as auth module), then insert the user with role `ADMIN` if no user with that email exists.
   - Use a script: `npm run seed` (to be implemented) that connects to DB, runs the seed logic, exits.
3. **Option B – one-off script**
   - Provide a CLI script that prompts for email and password (or reads from env), hashes the password, inserts the user, and exits.
   - Document in README: “Run once after first deploy to create the first admin.”
4. **Option C – migration with placeholder hash**
   - Migration inserts a user with a known bcrypt hash (e.g. for a temporary password like `ChangeMe123!`).
   - Document that the admin must change the password on first login (requires a “change password” flow later).
   - Less secure; prefer Option A or B.

## Example seed logic (pseudo-code)

- If no user with `email === SEED_ADMIN_EMAIL` exists:
  - `passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, 12)`
  - `INSERT INTO users (email, password_hash, name, role) VALUES (..., 'Admin', 'ADMIN')`
- Else: skip (idempotent).

## Roles (placeholder)

Align with API Spec access matrix when RBAC is fully defined. Example roles:

- `ADMIN` – full access, user management.
- `IMPORT_OFFICER` – transactions, documents, status, no user management.
- `VIEWER` – read-only.

Seed only the admin user; other roles can be assigned when the users module is implemented.
