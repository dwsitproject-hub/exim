# Staging dump → ApsaraDB restore (step by step)

Run **every command on the staging backend ECS**, in the EOS repo root. Do not run this against production. Do not restore this dump into the production RDS database.

**Source:** Docker `eos-postgres-staging` (PostgreSQL 16)  
**Target:** ApsaraDB RDS PostgreSQL 18 database `eos_staging` (VPC internal endpoint)

---

## Before you start (console)

1. ApsaraDB instance is PostgreSQL **18**, same VPC/region as this ECS.
2. Database **`eos_staging`** exists and is **empty** (no EOS tables yet).
3. A **staging-only** account can connect to `eos_staging` and run DDL.
4. This ECS **private IP** is on the RDS VPC whitelist.
5. You have the **internal** host, port (`5432`), user, and password.

If `eos_staging` already has objects from a failed try, empty it in the console (drop/recreate the database) or see [Empty the target](#empty-the-target-if-you-need-a-clean-restore).

---

## Step 1 — Confirm local Postgres is running

```bash
docker ps --filter name=eos-postgres-staging
```

You must see `eos-postgres-staging` **Up**. If it is not, start it with the local overlay (do **not** use `-v`):

```bash
docker compose -f docker-compose.staging.backend.yml \
  -f docker-compose.staging.backend.local-postgres.yml up -d postgres
```

Read the current DB name and user from staging env (examples: `eos`, `eos_db` — use **your** values):

```bash
grep -E '^(POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_DB)=' backend/.env
```

---

## Step 2 — Set variables

Replace the placeholders. URL-encode `@`, `#`, `/`, `%` in the RDS password.

```bash
export POSTGRES_USER='YOUR_LOCAL_USER'
export POSTGRES_PASSWORD='YOUR_LOCAL_PASSWORD'
export POSTGRES_DB='YOUR_LOCAL_DB'

export EOS_PG_CONTAINER=eos-postgres-staging
export DUMP=/tmp/eos-staging-rds-migrate-$(date -u +%Y%m%d-%H%M%S).sql.gz

export APSARA_HOST='rm-xxxx.pgsql.<region>.rds.aliyuncs.com'
export APSARA_USER='YOUR_STAGING_RDS_USER'
export APSARA_PASS='YOUR_ENCODED_STAGING_RDS_PASSWORD'
export APSARA_DATABASE_URL="postgres://${APSARA_USER}:${APSARA_PASS}@${APSARA_HOST}:5432/eos_staging?sslmode=require"
```

Install a Postgres client on the host if `psql` is missing (`postgresql-client` / `postgresql16` is fine for **restore** into 18).

---

## Step 3 — Test RDS from this ECS

```bash
psql "$APSARA_DATABASE_URL" -c 'SELECT version();'
```

Or:

```bash
chmod +x scripts/apsaradb/*.sh
./scripts/apsaradb/check-rds.sh
```

You should see `PostgreSQL 18.x`. If this fails, stop (whitelist, VPC, or password encoding). Do not dump yet if you cannot connect.

---

## Step 4 — Dump Docker Postgres 16

Keep the backend running for this first (dry) dump, or stop it first if you want a quiet copy. For the **final** copy, stop the backend (Step 7).

```bash
./scripts/apsaradb/dump-docker.sh "$DUMP"
```

Equivalent without the script:

```bash
docker exec eos-postgres-staging pg_dump \
  --no-owner --no-acl --format=plain \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  | gzip -c > "$DUMP"

ls -lh "$DUMP"
```

Confirm the file is non-empty (not a few bytes).

---

## Step 5 — Restore into `eos_staging`

Target database must be empty.

```bash
./scripts/apsaradb/restore-rds.sh "$DUMP"
```

Equivalent without the script:

```bash
gunzip -c "$DUMP" | psql --set ON_ERROR_STOP=1 "$APSARA_DATABASE_URL"
```

If `psql` errors mid-file, empty the database and restore again. Do **not** run backend migrations on an empty RDS DB and then restore on top.

---

## Step 6 — Compare row counts

```bash
export SOURCE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5422/${POSTGRES_DB}"
export TARGET_URL="$APSARA_DATABASE_URL"
./scripts/apsaradb/verify-counts.sh
```

Or by hand (repeat per table):

```bash
docker exec eos-postgres-staging \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  'SELECT COUNT(*) FROM _schema_migrations;'

psql "$APSARA_DATABASE_URL" -c 'SELECT COUNT(*) FROM _schema_migrations;'
```

Check at least: `_schema_migrations`, `users`, `shipments`, `imported_po_intake`, `purchase_orders`, `refresh_tokens`. Source and target counts must match.

---

## Step 7 — Final copy (write freeze)

If Step 4 ran while the API was still writing, freeze and repeat dump → empty RDS → restore → verify.

```bash
docker compose -f docker-compose.staging.backend.yml \
  -f docker-compose.staging.backend.local-postgres.yml stop backend
```

If staging is still on the old all-in-one compose:

```bash
docker compose -f docker-compose.staging.backend.yml stop backend
```

Then:

```bash
export DUMP=/tmp/eos-staging-rds-migrate-final-$(date -u +%Y%m%d-%H%M%S).sql.gz
./scripts/apsaradb/dump-docker.sh "$DUMP"
```

Empty `eos_staging` (below), then:

```bash
./scripts/apsaradb/restore-rds.sh "$DUMP"
./scripts/apsaradb/verify-counts.sh
```

Leave `eos-postgres-staging` **running or stopped**, but **never** `docker compose down -v`.

---

## Empty the target if you need a clean restore

In AliCloud console: delete database `eos_staging` and create it again (UTF8), same account privileges.

Or from `psql` as a user that can recreate `public`:

```bash
psql "$APSARA_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO public;
SQL
```

On ApsaraDB you may need the high-privilege account for this, then reconnect as the staging app account for restore.

---

## After restore (not part of dump/restore, but next)

1. Set staging `backend/.env`:

```env
DATABASE_URL=postgres://STAGING_USER:ENCODED_PASS@INTERNAL_HOST:5432/eos_staging?sslmode=require
DATABASE_SSL=true
```

2. Start backend **without** local Postgres:

```bash
docker compose -f docker-compose.staging.backend.yml up -d --build backend
```

3. Check `GET /api/v1/health` → `database: connected` and  
   `docker exec eos-backend-staging printenv DATABASE_URL` (must show the RDS host, not `postgres`).

Full cutover and rollback: [APSARADB-MIGRATION.md](./APSARADB-MIGRATION.md).
