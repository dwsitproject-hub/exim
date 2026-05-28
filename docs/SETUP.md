# EOS Setup Guide

This document covers dependencies, migrations, seeding, and run instructions for the Exim Operation System (EOS) after the PO intake + Shipment domain model is in place.

---

## 1. Dependency list

### System requirements

| Requirement | Version / note |
|-------------|-----------------|
| Node.js | ≥ 20 (backend and frontend) |
| PostgreSQL | 16 (or compatible; used in Docker as `postgres:16-alpine`) |
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

### Optional: PO polling

To enable PO polling (SaaS integration), set in backend env:

```env
PO_POLLING_ENABLED=true
PO_POLLING_INTERVAL_MS=300000
SAAS_PO_API_BASE_URL=https://your-saas-api.example.com
```

No DB seed is required for polling; it uses the same `imported_po_intake` tables created by migrations.

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

For step-by-step NAS integration (CIFS mount, `dev/EOS` layout, Docker bind, Option B env vars), see **[SYNOLOGY-INTEGRATION.md](./SYNOLOGY-INTEGRATION.md)**.
