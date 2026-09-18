#!/usr/bin/env bash
#
# Staging-first dump / restore / verify against ApsaraDB.
# Usage (on the backend ECS):
#   EOS_MIGRATE_ENV=staging APSARA_DATABASE_URL=... POSTGRES_USER=... POSTGRES_DB=... \
#     ./scripts/apsaradb/cutover.sh dump|restore|verify|all [dump.sql.gz]
#
# Production: EOS_MIGRATE_ENV=production (only after staging sign-off).
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_NAME="${EOS_MIGRATE_ENV:-}"
STEP="${1:-}"
DUMP="${2:-}"

if [[ "$ENV_NAME" != "staging" && "$ENV_NAME" != "production" ]]; then
  echo "Set EOS_MIGRATE_ENV=staging or production" >&2
  exit 1
fi

if [[ "$STEP" != "dump" && "$STEP" != "restore" && "$STEP" != "verify" && "$STEP" != "all" ]]; then
  echo "Usage: EOS_MIGRATE_ENV=staging|production $0 dump|restore|verify|all [dump.sql.gz]" >&2
  exit 1
fi

if [[ "$ENV_NAME" == "staging" ]]; then
  export EOS_PG_CONTAINER="${EOS_PG_CONTAINER:-eos-postgres-staging}"
else
  export EOS_PG_CONTAINER="${EOS_PG_CONTAINER:-eos-postgres-prod}"
fi

if [[ -z "$DUMP" ]]; then
  DUMP="/tmp/eos-${ENV_NAME}-rds-migrate-$(date -u +%Y%m%d-%H%M%S).sql.gz"
fi

run_dump() {
  "$ROOT/dump-docker.sh" "$DUMP"
}

run_restore() {
  if [[ -z "${APSARA_DATABASE_URL:-}" ]]; then
    echo "Set APSARA_DATABASE_URL to the ${ENV_NAME} RDS database (not the other env)." >&2
    exit 1
  fi
  "$ROOT/restore-rds.sh" "$DUMP"
}

run_verify() {
  export TARGET_URL="${TARGET_URL:-${APSARA_DATABASE_URL:-}}"
  "$ROOT/verify-counts.sh"
}

case "$STEP" in
  dump) run_dump ;;
  restore) run_restore ;;
  verify) run_verify ;;
  all)
    run_dump
    run_restore
    run_verify
    ;;
esac

echo "[apsaradb] ${ENV_NAME} ${STEP} complete. Next: docs/APSARADB-MIGRATION.md"
