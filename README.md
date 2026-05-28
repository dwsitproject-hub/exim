# Exim Operation System (EOS)

## Project overview

EOS is a centralized **Exim Operation System** that enables EXIM teams and stakeholders to track, manage, and monitor import transactions from purchase notification through to goods receipt at the warehouse. It replaces manual spreadsheet tracking with real-time shipment monitoring, centralized document management, shipment milestone timelines, and import duty tracking.

## Scope

**Phase 1 — Import operation only.**

- In scope: import transaction management, shipment monitoring, document management, forwarder bidding, import duty monitoring, shipment status timeline, dashboard and reporting.
- Out of scope for Phase 1: export operations, supplier portal, customs API integration, automated payment processing (planned for later phases).

## Tech stack

| Layer        | Technology        |
|-------------|-------------------|
| Frontend    | Next.js           |
| Backend     | Node.js           |
| Database    | PostgreSQL        |
| Orchestration | Docker Compose  |

## Architecture overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│  Frontend   │────▶│   Backend   │
│   (Client)  │     │  (Next.js)  │     │ (Node.js)   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                      ┌─────────────┐          │
                      │  PostgreSQL │◀─────────┘
                      └─────────────┘
```

- **Frontend**: Next.js app; UI, auth, API client; design tokens for styling.
- **Backend**: Modular Node.js API; REST over `/api/v1`; auth (JWT + refresh); RBAC; document storage abstraction.
- **Database**: PostgreSQL; migration-based schema; metadata and audit history; file binaries stored outside DB (abstract storage).

## Folder structure

```
EOS/
├── assets/           # Static assets, icons, templates, diagrams
├── backend/          # Node.js API (see backend/README.md)
├── frontend/         # Next.js app (see frontend/README.md)
├── docs/             # PRD, TSD, ERD, API spec, cursor rules
├── scripts/         # Utility scripts (e.g. docx extraction)
├── docker-compose.yml
├── .env              # Copy from .env.example and set values (do not commit)
└── README.md
```

## Setup steps

1. **Clone the repository** (if applicable) and open the project root.

2. **Create environment file for Docker Compose**
   - Copy the root `.env.example` to `.env`: `cp .env.example .env`
   - Edit `.env` and set at least `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (use strong values in production; defaults in the example allow quick local runs).
   - For local development without Docker, also copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env.local` as needed.

3. **Run with Docker Compose (recommended)**
   ```bash
   docker compose up --build
   ```
   - **Frontend:** http://localhost:3002  
   - **Backend API:** http://localhost:3003  
   - **PostgreSQL:** localhost:5433 (host port)
   - The backend container runs migrations automatically on startup.

4. **Optional: seed an admin user** (after services are up)
   ```bash
   docker compose exec backend npm run seed
   ```
   Set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env` first (see `backend/.env.example`).

5. **Optional: run backend and frontend locally without Docker**
   - Install Node.js, PostgreSQL, and set `DATABASE_URL` and other env vars.
   - Backend: `cd backend && npm install && npm run dev`
   - Frontend: `cd frontend && npm install && npm run dev`

## Ports

EOS uses the following **host** ports when running with Docker Compose. They are chosen to avoid conflicts with other projects (e.g. another app using 3000/3001, or Postgres on 5432):

| Service   | Host port | Note |
|-----------|-----------|------|
| Frontend  | 3002      | Next.js (avoids conflict with other project on 3000) |
| Backend   | 3003      | Node.js API (avoids conflict with other project on 3001) |
| PostgreSQL| 5433      | Avoids conflict with another PostgreSQL on 5432 |

Override with `POSTGRES_PORT`, `BACKEND_PORT`, or `FRONTEND_PORT` in a root `.env` if needed.

## Environment variables

Variables are split between root (for Docker Compose), backend, and frontend.

| Variable | Where | Description |
|----------|--------|-------------|
| `POSTGRES_USER` | Root / Backend | PostgreSQL user (default: `eos`) |
| `POSTGRES_PASSWORD` | Root / Backend | PostgreSQL password |
| `POSTGRES_DB` | Root / Backend | Database name (default: `eos_db`) |
| `POSTGRES_PORT` | Root | Host port for Postgres (default: `5433`; avoids conflict with other Postgres on 5432) |
| `BACKEND_PORT` | Root / Backend | Backend API port (default: `3003`) |
| `FRONTEND_PORT` | Root | Host port for frontend (default: `3002`) |
| `NODE_ENV` | Root / Both | `development` or `production` |
| `JWT_ACCESS_SECRET` | Backend | Secret for access tokens (required) |
| `JWT_REFRESH_SECRET` | Backend | Secret for refresh tokens (required) |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend API base URL for the browser |

See `backend/.env.example` and `frontend/.env.example` for the full list.

## Docker usage

- **Start all services (detached):**
  ```bash
  docker compose up -d --build
  ```

- **View logs:**
  ```bash
  docker compose logs -f
  docker compose logs -f backend
  ```

- **Stop:**
  ```bash
  docker compose down
  ```

- **Stop and remove volumes (resets DB and uploads):**
  ```bash
  docker compose down -v
  ```

- **Rebuild after code changes:**
  ```bash
  docker compose up -d --build
  ```

Postgres data is persisted in the `postgres_data` volume; backend uploads in `backend_uploads`. Do not rely on container filesystem for production document storage; use mounted volumes or external storage as per TSD.

## Migration instructions

- Migrations live under `backend/src/db/migrations/` and run **automatically** when the backend container starts (Postgres, then backend with migrate-then-start).
- To run migrations manually (e.g. when not using Docker): from `backend/`, run `npm run migrate` (requires `DATABASE_URL` in `.env`).
- To seed an admin user in Docker: set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in root `.env`, then `docker compose exec backend npm run seed`.

## Production / go-live

Before exposing EOS to real users or production data, work through **[docs/GO-LIVE-CHECKLIST.md](docs/GO-LIVE-CHECKLIST.md)** (CORS, secrets, TLS, backups, and items already implemented in-repo).

## Database backups (production)

Scheduled PostgreSQL dumps (daily **15:00 UTC** = **10 PM UTC+7**), **14-day** retention, **production-only** (`EOS_BACKUP_ENABLED` + `EOS_ENV`). See **`scripts/backup/README.md`** and **`docker-compose.backup.yml`**.

## Documentation references

- **docs/** — Product and technical documentation:
  - `docs/cursor_rules.md` — Engineering rules and conventions (mandatory for code generation).
  - `docs/SETUP.md` — Dependencies, migrations, seed, and run instructions (including PO intake + Shipment flow).
  - PRD, TSD, ERD, and API Specification (see `docs/` for Markdown exports from the source documents).
- **backend/README.md** — Backend architecture, modules, env, migrations, and run commands.
- **frontend/README.md** — Frontend structure, design tokens, env, and run commands.
