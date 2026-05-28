# EOS go-live checklist

Use this before pointing real users or production data at EOS. Tick items in order; adjust for your hosting (Docker, Kubernetes, VM, etc.).

---

## 1. Security changes already in this repo (baseline)

These were implemented to align with production-style hardening:

| Area | What was done | Where |
|------|----------------|--------|
| **CORS** | If `NODE_ENV` is **not** `development`, the API **requires** a non-empty `CORS_ORIGINS` allowlist at startup (no “reflect any origin” with credentials). | `backend/src/app/index.ts` |
| **Auth rate limits** | Limits on login, refresh, logout, verify-email, forgot-password, reset-password (per IP). | `backend/src/middlewares/auth-rate-limit.ts`, `backend/src/modules/auth/routes.ts` |
| **Cookie `Secure` (HTTPS)** | Access/refresh cookie flags include `Secure` when the page is loaded over HTTPS. | `frontEnd/lib/cookies.ts` |
| **Staging compose** | Default `CORS_ORIGINS` for local browser testing on port 3020 when using `docker-compose.staging.backend.yml`. | `docker-compose.staging.backend.yml` |
| **Error responses** | Non-development environments no longer return raw 500 error text to clients (only `development` does). | `backend/src/middlewares/errorHandler.ts` |
| **Authorization** | After JWT verification, `req.user` is built from the **database** (`userRowToAuthUser`), so role/permission changes apply on the next request without waiting for token expiry. | `backend/src/modules/auth/auth.middleware.ts`, `auth-user-mapper.ts` |
| **JWT_REFRESH_SECRET** | Not required at runtime (refresh tokens are opaque rows in `refresh_tokens`). Only `JWT_ACCESS_SECRET` is required for signing access JWTs. | `backend/src/modules/auth/services/auth.service.ts`, `backend/.env.example` |
| **HttpOnly auth cookies** | Login/refresh set `eos_access` and `eos_refresh` as **HttpOnly** cookies (not readable by JS); JSON responses omit tokens. Next proxy forwards `Set-Cookie`. Use `COOKIE_SECURE=true` with HTTPS. | `backend/src/modules/auth/auth-cookies.ts`, `auth.controller.ts`, `frontEnd/services/api-client.ts` |
| **Proxy** | API route streams request bodies to the backend (when a body exists) and forwards `Set-Cookie` from upstream. | `frontEnd/app/api/backend/[...path]/route.ts` |
| **Uploads** | Multipart files land in the OS temp dir; **storage** uses `uploadFromPath` to **stream** into `STORAGE_LOCAL_PATH` (no full-file buffer). CSV imports read UTF-8 from the temp file then unlink. | `local-storage.adapter.ts`, `upload.middleware.ts`, `read-multer-upload.ts` |

---

## 2. Is the project “production ready”?

**Not by flipping a single switch.** The codebase has sensible defaults (Helmet, parameterized SQL in reviewed paths, bcrypt, JWT + server-side refresh tokens, CORS allowlist in non-dev), but **production readiness** depends on **your** environment: TLS, secrets, database operations, monitoring, and organizational policies. Complete the sections below and treat anything unchecked as a known gap.

---

## 3. Environment and configuration

- [ ] **`NODE_ENV`**: Use `production` for built backend/frontend in real deployments (avoid ad-hoc values unless every component documents them). Staging can use `production` + a separate `APP_ENV=staging` if you need feature flags.
- [ ] **`CORS_ORIGINS`**: Set to every **browser origin** where the EOS UI is served (scheme + host + port, no paths), comma-separated — e.g. `https://eos.example.com,https://www.example.com`. Required when backend `NODE_ENV !== development`.
- [ ] **`JWT_ACCESS_SECRET`**: Long, random, unique per environment; never reuse dev secrets; rotate if leaked. (`JWT_REFRESH_SECRET` is optional — unused by current code.)
- [ ] **`COOKIE_SECURE`**: Set `true` on the backend when the site is served over **HTTPS** so auth cookies use the `Secure` flag (leave `false` for plain `http://localhost` dev).
- [ ] **`DATABASE_URL`**: Strong DB credentials; DB not exposed to the public internet; TLS to Postgres if traffic crosses networks.
- [ ] **`FRONTEND_BASE_URL`**: Correct public URL for email verification and password-reset links.
- [ ] **`ALLOW_ANY_EMAIL`**: `false` in production unless you explicitly allow open registration.
- [ ] **SMTP**: Valid host, TLS as required (`SMTP_SECURE` / port), authenticated relay; test forgot-password and verification emails end-to-end.

---

## 4. Transport and network

- [ ] **HTTPS everywhere** for the UI and for any **direct** browser → API URL (if you do not use only same-origin proxying).
- [ ] **Reverse proxy** (nginx, Traefik, cloud LB): TLS termination, sensible timeouts, upload size limits aligned with API (e.g. 10 MB).
- [ ] **Internal-only backend**: Prefer the Next.js `BACKEND_INTERNAL_URL` pattern so the browser never talks to raw backend host:port on the internet, if that matches your architecture.

---

## 5. Application and data

- [ ] **Migrations**: `npm run migrate` / `migrate:prod` has been run on the target DB (backend Dockerfile runs migrate before start — confirm ordering fits your release process).
- [ ] **Seed**: Do not rely on default seed credentials in production; remove or rotate `SEED_ADMIN_*` after first bootstrap.
- [ ] **File storage**: `STORAGE_LOCAL_PATH` / volumes point to durable storage (see staging NAS notes in compose); plan backups for uploads.
- [ ] **Dependencies**: Run `npm audit` in `backend/` and `frontEnd/`; address critical/high issues per your policy.

---

## 6. Operations

- [ ] **PostgreSQL backups (production):** Enable `EOS_BACKUP_ENABLED=true` and `EOS_ENV=production` only on prod; use `docker-compose.backup.yml` (profile `production-backup`) or host cron — daily **15:00 UTC** (10 PM UTC+7), **14-day** retention. See `scripts/backup/README.md`.
- [ ] **Health checks**: Use `/api/v1/health` (or your LB path) for liveness/readiness.
- [ ] **Logging**: Centralize logs; ensure no secrets in log lines; log level appropriate (`LOG_LEVEL`).
- [ ] **Backups**: Postgres backups + restore tested; RPO/RTO agreed.
- [ ] **Incident**: Owner for on-call, runbook for DB restore and secret rotation.

---

## 7. Known follow-ups (not blockers for every team, but track them)

| Topic | Note |
|-------|------|
| **XSS** | Access and refresh tokens are **HttpOnly** cookies; JS cannot read them. Mitigate XSS for other reasons (data exfil, actions as user). |
| **JWT claims** | Access tokens still carry role/permissions for clients that decode JWTs; **server-side RBAC** uses the DB on each request. Shorten access TTL if you want faster global sign-out after role change. |
| **Rate limits** | IP-based limits help; consider extra protection at the edge (WAF, CAPTCHA on auth if abused). |
| **Dependency audit** | Re-run `npm audit` on each release. |

---

## 8. Quick verification before cutover

1. From a **production-like** build, open the UI at the **real** URL and sign in; confirm **no CORS errors** in the browser console.
2. Call an authenticated API from the UI; confirm **429** after excessive auth requests (rate limit), not a silent hang.
3. Trigger a **500** on purpose in a test env; confirm the client sees a **generic** message, not stack traces or SQL.
4. Confirm password reset and verification emails use **`FRONTEND_BASE_URL`** links that work over HTTPS.

---

## 9. Related files

- Backend env template: `backend/.env.example`
- Compose env template: `.env.example`
- Staging backend: `docker-compose.staging.backend.yml`
- Staging frontend: `docker-compose.staging.frontend.yml`
