# ApsaraDB RDS migration runbook

Move EOS PostgreSQL from Docker (`postgres:16-alpine`) on the backend ECS host to **ApsaraDB RDS for PostgreSQL 18**. Staging is the required gate. Production stays on local Docker Postgres until staging acceptance passes.

Files and uploads on Synology are unchanged. Only relational data moves.

**Product:** ApsaraDB RDS for PostgreSQL 18, **VPC internal endpoint** (not public). Staging and production use **separate databases and accounts** on the same instance.

Operator scripts live in [`scripts/apsaradb/`](../scripts/apsaradb/).

---

## Phase 1 — Prepare the RDS instance (console)

Do this before changing compose on any host.

1. Confirm the instance engine is **PostgreSQL 18**.
2. Confirm the instance is in the **same VPC and region** as the staging and production backend ECS hosts. If VPCs differ, add peering or CEN first. Do not use a public endpoint.
3. **Databases → Create Database** (UTF8):
   - `eos_staging` (staging)
   - Production name matching the live dump (`eos_db` or `exim_db`)
4. **Accounts → Create Account** (privileged enough for DDL). Two accounts, each granted on **only** its database:
   - Staging account → `eos_staging` only
   - Production account → production database only
   Do not use the instance high-privilege login in `DATABASE_URL`.
5. **Data Security → Whitelist (VPC):** add the staging backend ECS **private IP** and the production backend ECS **private IP** (or their security groups). If both stacks share one host, one IP is enough.
6. **Database Connection:** copy the **internal** endpoint and port (usually `5432`).
7. Confirm **automated backups** are on (daily, 7–14 day retention).

Connectivity test **from the staging ECS** (not a laptop):

```bash
export APSARA_DATABASE_URL='postgres://STAGING_USER:ENCODED_PASS@INTERNAL_HOST:5432/eos_staging?sslmode=require'
./scripts/apsaradb/check-rds.sh
```

URL-encode `@`, `#`, `/`, and `%` in the password. If this fails, stop (wrong VPC, missing whitelist IP, or encoding). Repeat from the production ECS against the **production** database only after staging sign-off.

---

## Phase 2 — Repo / env (already in this repo)

Staging and production compose no longer start a local `postgres` service. `DATABASE_URL` must come from `backend/.env` on that host.

Example staging URL:

```env
DATABASE_URL=postgres://eos_staging:ENCODED_PASS@rm-xxxx.pgsql.<region>.rds.aliyuncs.com:5432/eos_staging?sslmode=require
DATABASE_SSL=true
```

Local development still uses [`docker-compose.yml`](../docker-compose.yml) with `postgres:16-alpine`.

**Deploy order:** apply compose + env on the **staging host first**. Do not deploy production compose or backup changes on the production host until Phase 3 acceptance passes.

Rollback overlays (local PG 16 only):

- [`docker-compose.staging.backend.local-postgres.yml`](../docker-compose.staging.backend.local-postgres.yml)
- [`docker-compose.production.backend.local-postgres.yml`](../docker-compose.production.backend.local-postgres.yml)

---

## Phase 3 — Staging cutover (required gate)

Copy-paste dump → restore only: **[APSARADB-STAGING-DUMP-RESTORE.md](./APSARADB-STAGING-DUMP-RESTORE.md)**.

Do not touch production data or production compose on the prod host.

### 3a. Dump while local Postgres is still running

```bash
export EOS_PG_CONTAINER=eos-postgres-staging
export POSTGRES_USER=...          # same as current staging
export POSTGRES_DB=...
./scripts/apsaradb/dump-docker.sh /tmp/eos-staging-rds-migrate.sql.gz
```

### 3b. Restore into empty `eos_staging`

```bash
export APSARA_DATABASE_URL='postgres://STAGING_USER:ENCODED_PASS@INTERNAL_HOST:5432/eos_staging?sslmode=require'
./scripts/apsaradb/restore-rds.sh /tmp/eos-staging-rds-migrate.sql.gz
```

### 3c. Compare counts (source container vs RDS)

```bash
export SOURCE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5422/${POSTGRES_DB}"
export TARGET_URL="$APSARA_DATABASE_URL"
./scripts/apsaradb/verify-counts.sh
```

Staging compose publishes Postgres on host port **5422**. Adjust `SOURCE_URL` if your port differs.

### 3d. Freeze writes, final dump, restore onto a clean database

```bash
docker compose -f docker-compose.staging.backend.yml stop backend
# Repeat dump + empty the RDS database (drop/recreate eos_staging) + restore + verify-counts
```

Do not migrate an empty RDS database and then restore a full dump on top. The dump already includes `_schema_migrations`.

### 3e. Point staging at RDS

1. Set `DATABASE_URL` (and optional `DATABASE_SSL=true`) in staging `backend/.env` to the **internal** endpoint and **`eos_staging`**.
2. Recreate backend **without** local postgres:

```bash
docker compose -f docker-compose.staging.backend.yml up -d --build backend
```

3. Leave `eos-postgres-staging` **stopped**. Do **not** `docker compose down -v`.

### 3f. Staging acceptance (all required before Phase 4)

- [ ] `GET /api/v1/health` → `database: connected`
- [ ] Login
- [ ] Open and edit a shipment and a PO; create one new row (`gen_random_uuid()` on PG 18)
- [ ] Open an existing document (NAS path unchanged)
- [ ] Backend logs show migrations **skipped**
- [ ] `docker exec eos-backend-staging printenv DATABASE_URL` shows the RDS host, not `postgres`
- [ ] Soak at least one business day (or until the flows above are signed off)

**Staging rollback** (PG 16 volume only — do not restore a PG 18 dump onto it):

```bash
# Point backend/.env DATABASE_URL back at local compose, or use the overlay override
docker compose -f docker-compose.staging.backend.yml \
  -f docker-compose.staging.backend.local-postgres.yml up -d
```

---

## Phase 4 — Production cutover (only after staging sign-off)

Same procedure, production names and files.

```bash
docker compose -f docker-compose.production.backend.yml stop backend

export EOS_PG_CONTAINER=eos-postgres-prod
./scripts/apsaradb/dump-docker.sh /tmp/eos-prod-rds-migrate.sql.gz

export APSARA_DATABASE_URL='postgres://PROD_USER:ENCODED_PASS@INTERNAL_HOST:5432/PROD_DB?sslmode=require'
# Empty the production RDS database, then:
./scripts/apsaradb/restore-rds.sh /tmp/eos-prod-rds-migrate.sql.gz
./scripts/apsaradb/verify-counts.sh
```

Set production `backend/.env` `DATABASE_URL` to the **production** database. Recreate backend with [`docker-compose.production.backend.yml`](../docker-compose.production.backend.yml). Then start backups (PG 18 client):

```bash
docker compose -f docker-compose.production.backend.yml \
  -f docker-compose.backup.yml --profile production-backup up -d --build
```

Confirm `/api/v1/health`, login, shipment, PO, and documents. Bring the frontend back if it was stopped.

**Production rollback:** keep `eos-postgres-prod` stopped (no `-v`). Revert `DATABASE_URL` and merge [`docker-compose.production.backend.local-postgres.yml`](../docker-compose.production.backend.local-postgres.yml).

---

## Phase 5 — After each cutover

- **Staging:** keep the local volume until production is also stable. Do not enable the production backup scheduler on staging.
- **Production:** confirm `eos-*.sql.gz` appears under `/opt/exim/scripts/backup` and that RDS console backups succeed. Remove temporary whitelist IPs.
- After soak: stop unused `postgres` containers; archive then delete `postgres_data` only when rollback is no longer needed (recommend 14 days).

---

## Version notes (16 → 18)

- Dump the **16** container with that container’s `pg_dump`.
- Restore into **18** with `psql`.
- After production cutover, the backup image must be `postgres:18-alpine` (`pg_dump` 16 refuses to dump a 18 server).
- Rollback is the frozen local **16** volume, not an RDS dump.
