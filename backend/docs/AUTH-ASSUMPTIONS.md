# Auth module – assumptions and notes

## Implemented

- **POST /auth/login** – email + password; returns access_token, refresh_token, user; password compared with bcrypt; no plain-text storage.
- **POST /auth/refresh** – body: refresh_token; validates token in DB (not revoked, not expired), issues new access token and rotates refresh token.
- **POST /auth/logout** – body: refresh_token; revokes the token in DB.
- **GET /auth/me** – requires `Authorization: Bearer <access_token>`; returns current user (id, name, email, role).
- **Auth middleware** – verifies JWT, sets `req.user`.
- **RBAC middleware** – `requireRole('ADMIN', 'IMPORT_OFFICER')` etc.; use after auth middleware.
- **Validation** – login (email required + format, password required); refresh/logout (refresh_token required).
- **Standard response format** – success/error shapes per API Spec.
- **Refresh token revocation** – tokens stored in `refresh_tokens`; revoke on logout and on refresh (rotation).

## Assumptions

1. **JWT secrets**  
   `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be set in env when using auth. If missing, login/refresh return 500 with “Auth is not configured”.

2. **Database tables**  
   Auth expects `users` and `refresh_tokens` (see `src/db/migrations/001_auth_tables.sql`). Run that migration (or equivalent) before using auth.

3. **Roles**  
   Role is a string (e.g. `ADMIN`, `IMPORT_OFFICER`, `VIEWER`). No roles table yet; RBAC checks `req.user.role` against allowed list. Add a roles/permissions table later if needed.

4. **Password hashing**  
   bcrypt with 12 rounds. No plain-text passwords in DB or logs.

5. **Refresh token storage**  
   Opaque token (random bytes) stored in `refresh_tokens`. Expiry and revocation are in DB; no JWT for refresh.

6. **Rate limiting / lockout**  
   Not implemented. API Spec recommends rate limiting and lockout after failed attempts; structure is ready (middleware can be added later).

7. **GET /auth/me and JWT**  
   Access token payload includes sub, email, name, role. Middleware sets `req.user` from JWT; `getMe` can re-fetch from DB for fresh data (implemented).

## Seed

See `docs/SEED-STRATEGY.md` for how to create the first admin user without committing passwords.
