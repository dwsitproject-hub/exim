# EOS production PostgreSQL backups

Targets **ApsaraDB RDS for PostgreSQL 18** after production cutover. The scheduler image is `postgres:18-alpine` because `pg_dump` 16 cannot dump a 18 server.

## Behaviour

- **When it runs:** every day at **15:00 UTC** (= **22:00 / 10 PM UTC+7**).
- **Retention:** files under `BACKUP_DIR` matching `eos-*.sql.gz` older than **14 days** are deleted (rolling window).
- **Production-only:** the script **exits successfully without dumping** unless both are set:
  - `EOS_BACKUP_ENABLED=true`
  - `EOS_ENV=production`

Do not enable this scheduler on staging.

## Connection

Prefer **`DATABASE_URL`** (same as the backend) pointing at the **VPC internal** endpoint:

`postgres://USER:PASSWORD@rm-xxxx.pgsql.<region>.rds.aliyuncs.com:5432/DBNAME?sslmode=require`

Alternatively set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

Also keep **RDS automated backups** enabled in the AliCloud console.

## Option A — Docker scheduler (recommended with Compose)

From the repo root, merge with the **production backend** stack (no local `postgres` service):

```bash
docker compose -f docker-compose.production.backend.yml \
  -f docker-compose.backup.yml --profile production-backup up -d --build
```

Set in **`backend/.env`** on the production host (only):

```env
EOS_BACKUP_ENABLED=true
EOS_ENV=production
DATABASE_URL=postgres://USER:PASSWORD@rm-xxxx.pgsql.<region>.rds.aliyuncs.com:5432/DBNAME?sslmode=require
```

With **`docker-compose.backup.yml`**, backups and the scheduler log are stored on the **Linux host** at **`/opt/exim/scripts/backup`** (mounted at `/backups/eos` in the container). Create the directory before first deploy if you need a specific owner: `sudo mkdir -p /opt/exim/scripts/backup`. Files: `eos-*.sql.gz`; log: `scheduler.log`.

**Do not** enable these variables on staging/dev if you rely on the script guard alone.

## Option B — Host cron (VM / bare metal)

1. Install PostgreSQL **18** client (`pg_dump`) on the host (must be ≥ server major version).
2. Copy `postgres-backup.sh` to e.g. `/opt/eos/scripts/` and `chmod +x`.
3. Use the same env vars (export or prefix the command).
4. Install a crontab entry — **15:00 UTC** = 10 PM UTC+7:

```cron
0 15 * * * EOS_BACKUP_ENABLED=true EOS_ENV=production BACKUP_DIR=/var/backups/eos RETENTION_DAYS=14 DATABASE_URL='postgres://...' /opt/eos/scripts/postgres-backup.sh >> /var/log/eos-backup.log 2>&1
```

If the server uses local timezone **UTC+7**, you may instead use:

```cron
0 22 * * * ...
```

(Verify with `date` and a test job.)

## Restoring

Restore only onto a **PostgreSQL 18** database (ApsaraDB). Do not load a PG 18 dump into local Docker PG 16.

```bash
gunzip -c eos-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"
```

Cutover dump/restore (16 → 18) is documented in **[docs/APSARADB-MIGRATION.md](../../docs/APSARADB-MIGRATION.md)**.

## Uploads / files

This job backs up **PostgreSQL only**. Application uploads live under `STORAGE_LOCAL_PATH` (e.g. NAS bind mount); back those up with your storage vendor’s snapshot or a separate file sync if required.
