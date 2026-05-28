#!/usr/bin/env bash
#
# EOS PostgreSQL logical backup (gzip SQL). Production-only; 14-day retention of files.
# Schedule: 22:00 UTC+7 == 15:00 UTC daily (see crontab / Docker).
#
# Required for a run:
#   EOS_BACKUP_ENABLED=true
#   EOS_ENV=production
#
# Connection: DATABASE_URL (preferred) or PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
#
set -euo pipefail

if [[ "${EOS_BACKUP_ENABLED:-}" != "true" ]]; then
  echo "[eos-backup] EOS_BACKUP_ENABLED is not 'true'; skipping (not an error)."
  exit 0
fi

if [[ "${EOS_ENV:-}" != "production" ]]; then
  echo "[eos-backup] EOS_ENV is not 'production'; skipping (not an error)."
  exit 0
fi

BACKUP_DIR="${BACKUP_DIR:-/backups/eos}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"

TS="$(date -u +%Y%m%d-%H%M%S)"
FILE="${BACKUP_DIR}/eos-${TS}.sql.gz"

echo "[eos-backup] Starting backup -> ${FILE}"

if [[ -n "${DATABASE_URL:-}" ]]; then
  # shellcheck disable=SC2086
  pg_dump --no-owner --no-acl --format=plain "${DATABASE_URL}" | gzip -c > "${FILE}"
else
  : "${PGHOST:?PGHOST or DATABASE_URL required}"
  : "${PGUSER:?PGUSER required}"
  : "${PGPASSWORD:?PGPASSWORD required}"
  : "${PGDATABASE:?PGDATABASE required}"
  export PGHOST PGPORT="${PGPORT:-5432}" PGUSER PGPASSWORD PGDATABASE
  pg_dump --no-owner --no-acl --format=plain | gzip -c > "${FILE}"
fi

# Remove backup files older than RETENTION_DAYS (keep rolling ~14 daily files)
find "${BACKUP_DIR}" -type f -name 'eos-*.sql.gz' -mtime "+${RETENTION_DAYS}" -print -delete || true

echo "[eos-backup] Done. Size: $(du -h "${FILE}" | cut -f1)"
