#!/usr/bin/env bash
#
# Logical dump from a running EOS Docker Postgres 16 container.
# Usage: EOS_PG_CONTAINER=eos-postgres-staging ./dump-docker.sh [outfile.sql.gz]
#
set -euo pipefail

CONTAINER="${EOS_PG_CONTAINER:-eos-postgres-staging}"
USER_NAME="${POSTGRES_USER:-}"
DB_NAME="${POSTGRES_DB:-}"
OUT="${1:-/tmp/eos-rds-migrate-$(date -u +%Y%m%d-%H%M%S).sql.gz}"

if [[ -z "$USER_NAME" || -z "$DB_NAME" ]]; then
  echo "Set POSTGRES_USER and POSTGRES_DB (same as the container)." >&2
  exit 1
fi

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "Container $CONTAINER is not running. Dump before stopping Postgres." >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
echo "[apsaradb] Dumping $CONTAINER ($DB_NAME) -> $OUT"
docker exec "$CONTAINER" pg_dump \
  --no-owner --no-acl --format=plain \
  -U "$USER_NAME" -d "$DB_NAME" \
  | gzip -c > "$OUT"

echo "[apsaradb] Done. Size: $(du -h "$OUT" | cut -f1)"
echo "$OUT"
