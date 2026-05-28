# EOS production PostgreSQL backups

## Behaviour

- **When it runs:** every day at **15:00 UTC** (= **22:00 / 10 PM UTC+7**).
- **Retention:** files under `BACKUP_DIR` matching `eos-*.sql.gz` older than **14 days** are deleted (rolling window).
- **Production-only:** the script **exits successfully without dumping** unless both are set:
  - `EOS_BACKUP_ENABLED=true`
  - `EOS_ENV=production`

## Connection

Prefer **`DATABASE_URL`** (as used by the backend). For Docker Compose, use the DB hostname **`postgres`**, e.g.:

`postgres://USER:PASSWORD@postgres:5432/DBNAME`

Alternatively set `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.

## Option A — Docker scheduler (recommended with Compose)

From the repo root, **merge** this file with your running stack so the `postgres` service exists:

```bash
docker compose -f docker-compose.yml -f docker-compose.backup.yml --profile production-backup up -d --build
```

Set in **`backend/.env`** on the production host (only):

```env
EOS_BACKUP_ENABLED=true
EOS_ENV=production
```

With **`docker-compose.backup.yml`**, backups and the scheduler log are stored on the **Linux host** at **`/opt/exim/scripts/backup`** (mounted at `/backups/eos` in the container). Create the directory before first deploy if you need a specific owner: `sudo mkdir -p /opt/exim/scripts/backup`. Files: `eos-*.sql.gz`; log: `scheduler.log`.

**Do not** enable these variables on staging/dev if you rely on the script guard alone.

## Option B — Host cron (VM / bare metal)

1. Install PostgreSQL client (`pg_dump`) on the host.
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

```bash
gunzip -c eos-YYYYMMDD-HHMMSS.sql.gz | psql "$DATABASE_URL"
```

## Uploads / files

This job backs up **PostgreSQL only**. Application uploads live under `STORAGE_LOCAL_PATH` (e.g. NAS bind mount); back those up with your storage vendor’s snapshot or a separate file sync if required.
