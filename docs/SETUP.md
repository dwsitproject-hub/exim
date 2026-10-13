# EOS Setup Guide

This document covers dependencies, migrations, seeding, and run instructions for the Exim Operation System (EOS) after the PO intake + Shipment domain model is in place.

---

## 1. Dependency list

### System requirements

| Requirement | Version / note |
|-------------|-----------------|
| Node.js | ≥ 20 (backend and frontend) |
| PostgreSQL | Local Docker: 16 (`postgres:16-alpine`). Staging/production: ApsaraDB RDS PostgreSQL 18 (see `docs/APSARADB-MIGRATION.md`) |
| Docker & Docker Compose | For running all services together |

### Backend (`backend/`)

| Dependency | Purpose |
|------------|--------|
| express | HTTP server, routing |
| pg | PostgreSQL client |
| bcrypt | Password hashing |
| jsonwebtoken | JWT auth |
| cors | CORS middleware |
| helmet | Security headers |
| dotenv | Env loading |
| multer | File upload (documents) |
| uuid | UUID generation |

Dev: `typescript`, `tsx`, `@types/*` (node, express, pg, bcrypt, jsonwebtoken, multer, uuid, cors).

### Frontend (`frontend/`)

| Dependency | Purpose |
|------------|--------|
| next | React framework, App Router |
| react / react-dom | UI |

Dev: `typescript`, `@types/node`, `@types/react`, `@types/react-dom`.

### Optional (PO polling)

Backend PO polling uses the existing HTTP client (no extra package). For a real SaaS PO API, add an HTTP client (e.g. `node-fetch` or `axios`) as needed.

---

## 2. Migration instructions

### Migration files (order)

Migrations live in `backend/src/db/migrations/` and run in filename order:

| File | Contents |
|------|----------|
| `001_auth_tables.sql` | users, refresh_tokens |
| `002_rbac_roles_constraint.sql` | role constraints |
| `003_import_transactions.sql` | import_transactions (legacy) |
| `004_status_history.sql` | import_transaction_status_history |
| `005_documents.sql` | transaction_documents, document_versions |
| `006_notes.sql` | transaction_notes |
| `007_imported_po_intake.sql` | imported_po_intake, imported_po_intake_items |
| `008_shipments.sql` | shipments |
| `009_shipment_po_mapping.sql` | shipment_po_mapping |
| `010_shipment_status_history.sql` | shipment_status_history |

### Run migrations

**Option A — Docker (recommended)**  
Migrations run automatically when the backend container starts:

```bash
# From project root
docker compose up --build
```

The backend Dockerfile runs `npm run migrate:prod && npm run start`. Ensure `backend/src/db/migrations/` is present in the image (default `COPY . .` includes it).

**Option B — Local (no Docker)**  
From the backend directory, with `DATABASE_URL` set in `backend/.env`:

```bash
cd backend
npm install
npm run migrate
```

This runs `tsx src/db/run-migrations.ts`; the script reads migrations from `src/db/migrations/` relative to the current working directory, so run from `backend/`.

**Option C — Production (compiled)**  
From the backend directory, after `npm run build`:

```bash
npm run migrate:prod
```

Uses `node dist/db/run-migrations.js`. The script still resolves migrations from `process.cwd() + "/src/db/migrations"`, so either:

- Run from a directory that contains `src/db/migrations/` (e.g. full repo or a deploy that includes `src/`), or  
- Change the script to read from a path inside `dist/` (e.g. copy migrations into `dist/db/migrations/`) for dist-only deploys.

---

## 3. Seed instructions

### Admin user seed

Seeding creates a single admin user when the required env vars are set. It is idempotent (skips if the email already exists).

**Required environment variables**

- `SEED_ADMIN_EMAIL` — e.g. `admin@example.com`
- `SEED_ADMIN_PASSWORD` — plain password (used only for initial hash; never commit real passwords)

**With Docker**

1. Set in root `.env` (or backend env passed to the container):

   ```env
   SEED_ADMIN_EMAIL=admin@example.com
   SEED_ADMIN_PASSWORD=your-secure-password
   ```

2. With services up:

   ```bash
   docker compose exec backend npm run seed
   ```

**Local (no Docker)**  
From `backend/` with `backend/.env` containing `DATABASE_URL`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD`:

```bash
cd backend
npm run seed
```

**Production**  
Seed is skipped unless `RUN_SEED=true` or `RUN_SEED=1` is set, to avoid accidental creation of users.

### Optional: PO polling (Syncera)

Purchasing owns POs in Syncera. When polling is enabled, EOS pulls import POs from `GET /api/v1/po-import`, creates intake rows as **New PO detected**, and **amends** existing rows when the payload changes (same shipment-lock and delivery-qty rules as manual PO edit).

Set in backend env (host and credentials only — never commit secrets from the API guide):

```env
PO_POLLING_ENABLED=true
PO_POLLING_INTERVAL_MS=300000
SAAS_PO_API_BASE_URL=https://syncera.gamasap.com
SYNCERA_CLIENT_ID=
SYNCERA_CLIENT_SECRET=
SYNCERA_POLL_LOOKBACK_DAYS=14
# Optional 2-character company filter
# SYNCERA_COMPANY=
```

Use `https://syncera-dev.gamasap.com` for the Syncera dev host. If `PO_POLLING_ENABLED=true` but URL or credentials are missing, the API logs an error and does **not** start the interval (unless `MOCK_PO_SAMPLES=true` for local E2E).

**Manual QA**

1. Enable polling against a host that returns at least one PO in the lookback window.
2. Confirm a row on `/dashboard/po` with status New PO detected, `created_by_user_id` null, and a `po_detected` notification for Import officers.
3. Re-run a cycle with the same payload — metrics should show `unchanged`, no second PO.
4. Change header or line qty/price in Syncera (or a mock client) — next cycle amends the row, writes activity as `SYNCERA_POLL`, and sends `po_amended`.
5. Couple the PO to a shipment at Ready Pickup or later — further Syncera changes are skipped (`skippedLockedAmendment`), not applied.

Known limitation: if Syncera stops returning a PO (cancel/void), EOS does not auto-delete it.

**PO line units:** Unknown Syncera units (e.g. `M3`, `TUB`) are inserted into `po_item_unit_codes` on first sight and merged with the seed list for validation and UI (`GET /po/unit-options`). Run migrations through `091_po_item_unit_codes.sql`.

**Syncera integration trail:** Each poll cycle and per-PO outcome (created, updated, skipped, failed) is stored in `syncera_po_poll_runs` / `syncera_po_integration_events`. View in the app under **Syncera integration** (`GET /po/syncera-integration/runs` and `/events`). Run migration `092_syncera_po_integration_audit.sql`.

No DB seed is required for polling; it uses `import_purchase_order` (created by migrations).

---

## 4. Run instructions

### Full stack with Docker (recommended)

From project root:

```bash
# Copy env and set at least JWT secrets (and DB password if desired)
cp .env.example .env
# Edit .env as needed

# Build and start
docker compose up --build
```

- **Frontend:** http://localhost:3002 (or `FRONTEND_PORT`)  
- **Backend API:** http://localhost:3003 (or `BACKEND_PORT`)  
- **PostgreSQL:** host port 5433 (or `POSTGRES_PORT`)

Backend runs migrations on startup, then starts the API. To seed admin:

```bash
docker compose exec backend npm run seed
```

(With `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env`.)

### Backend only (local)

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

npm install
npm run migrate
npm run dev
```

API: http://localhost:3003 (or `PORT` in `.env`).

### Frontend only (local)

Backend must be running and reachable. Set the API base URL for the browser:

```bash
cd frontend
# In .env.local or .env:
# NEXT_PUBLIC_API_URL=http://localhost:3003/api/v1

npm install
npm run dev
```

App: http://localhost:3000 (Next.js default). If the backend is on another host/port, set `NEXT_PUBLIC_API_URL` accordingly.

### Production-style run

```bash
# Backend
cd backend
npm ci
npm run build
npm run migrate:prod   # ensure DB and migration path (see Migration instructions)
npm run start

# Frontend (separate host or container)
cd frontend
npm ci
npm run build
npm run start
```

Use a process manager (e.g. systemd, PM2) or orchestration (e.g. Kubernetes) in production; ensure `DATABASE_URL`, JWT secrets, and CORS are set correctly.

---

## Synology / shared storage

For Synology storage env vars and Docker bind alignment (when the NAS is already mounted on the server), see **[SYNOLOGY-INTEGRATION.md](./SYNOLOGY-INTEGRATION.md)**.

Staging/production database (ApsaraDB RDS PostgreSQL 18, staging first): **[APSARADB-MIGRATION.md](./APSARADB-MIGRATION.md)**. Until cutover, merge `docker-compose.*.backend.local-postgres.yml` so the local PG 16 volume stays in use.
