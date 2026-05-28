# EOS Backend

Backend API for **Exim Operation System (EOS)** — Phase 1 Import. Modular Node.js (Express + TypeScript) application with PostgreSQL.

## Architecture overview

- **Modular layout**: `src/config`, `src/db`, `src/middlewares`, `src/shared`, `src/utils`, `src/app`, `src/server`, `src/modules`.
- **Layers**: routes → controllers → services → repositories; validators/dto for input; middlewares for auth, RBAC, error handling.
- **API**: REST over `/api/v1`; standard success/error response format; centralized error handler; no stack traces in production.
- **Database**: PostgreSQL via `pg` pool; migrations in `src/db/migrations/`, run with `npm run migrate`.

```
backend/
├── src/
│   ├── app/           # Express app bootstrap, route mounting
│   ├── config/        # Env config loader
│   ├── db/            # Pool, run-migrations, seed, migrations
│   ├── middlewares/   # Error handling, auth, RBAC, upload
│   ├── shared/        # Response helpers, RBAC, storage
│   ├── utils/         # Logger
│   ├── modules/       # Feature modules (health, auth, import-transactions, …)
│   ├── server.ts      # HTTP server listen
│   └── index.ts       # Entry: config → db → app → server
├── src/db/migrations/ # SQL migration files (001_…, 002_…, …)
├── package.json
├── tsconfig.json
├── Dockerfile
└── .env.example
```

## Run instructions

### Exact run commands

From the **backend** directory (`backend/`):

| Command | Description |
|--------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start dev server (tsx watch); API at http://localhost:3003 |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled app (`node dist/index.js`) |
| `npm run migrate` | Run all SQL migrations (requires `DATABASE_URL` in `.env`) |
| `npm run seed` | Seed admin user if `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are set |

### Local (no Docker)

1. Copy `.env.example` to `.env` and set `DATABASE_URL` (and JWT secrets for auth).
2. Run migrations, then start:
   ```bash
   npm install
   npm run migrate
   npm run dev
   ```
   API: http://localhost:3003 (or the `PORT` in `.env`).

### Production build

```bash
npm run build
npm run start
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | No | `development` \| `production` (default: development) |
| `PORT` | No | Server port (default: 3003) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | When auth used | Secret for access tokens |
| `JWT_REFRESH_SECRET` | No | Optional; not used by current code (refresh tokens are stored in DB) |
| `JWT_ACCESS_EXPIRES_IN` | No | e.g. 4h (access JWT) |
| `JWT_REFRESH_EXPIRES_IN` | No | e.g. 4h (refresh session / cookie; align with access for fixed session length) |
| `STORAGE_TYPE` | No | local \| shared-folder \| s3 |
| `STORAGE_LOCAL_PATH` | No | Base folder for uploads (default: `./uploads`). If unset, can be built from `STORAGE_SYNOLOGY_ROOT` + `STORAGE_DEPLOYMENT` + `STORAGE_PROJECT_SLUG` (e.g. `dev` + `EOS`). See `.env.example`. |
| `STORAGE_SYNOLOGY_ROOT` | No | With `STORAGE_DEPLOYMENT` and `STORAGE_PROJECT_SLUG`, composes the local path (ignored when `STORAGE_LOCAL_PATH` is set). |
| `STORAGE_DEPLOYMENT` | No | e.g. `dev` or `prod` — folder under the Synology mount. |
| `STORAGE_PROJECT_SLUG` | No | App folder on the share (e.g. `EOS`); other integrations use another slug. |
| `LOG_LEVEL` | No | debug \| info \| warn \| error (default: info) |
| `CORS_ORIGINS` | Yes when `NODE_ENV` ≠ `development` | Comma-separated allowed origins; in development, empty allows any origin |
| `SEED_ADMIN_EMAIL` | For seed | Admin email when running `npm run seed` |
| `SEED_ADMIN_PASSWORD` | For seed | Admin password (development only, or with `RUN_SEED=true`) |

See `.env.example` for the full list.

## Docker usage

- **From project root** (recommended):
  ```bash
  docker compose up --build
  ```
  Backend runs on host port 3003; Postgres and env are provided by Compose.

- **Build and run only backend image**:
  ```bash
  docker build -t eos-backend .
  docker run --env-file .env -p 3003:3003 eos-backend
  ```
  Ensure `DATABASE_URL` points to a reachable Postgres instance.

## Migrations

- Migration files live under `src/db/migrations/` (e.g. `001_auth_tables.sql`, `002_rbac_roles_constraint.sql`, …).
- **Run migrations** (from `backend/` with `.env` containing `DATABASE_URL`):
  ```bash
  npm run migrate
  ```
  Runs all `.sql` files in order. Run once per environment after the database is created.

## Seed (admin user)

- To create an initial admin user, set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env`, then run (from `backend/`):
  ```bash
  npm run seed
  ```
  Seed runs only in development or when `RUN_SEED=true`. It is idempotent (skips if the user already exists). See `docs/SEED-STRATEGY.md` for details.
