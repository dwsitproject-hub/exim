#!/usr/bin/env bash
#
# Compare row counts between source (local Docker) and target (ApsaraDB).
# Usage:
#   SOURCE_URL=postgres://... TARGET_URL=postgres://... ./verify-counts.sh
#   # or SOURCE via Docker:
#   EOS_PG_CONTAINER=eos-postgres-staging POSTGRES_USER=... POSTGRES_DB=... \
#     TARGET_URL=... ./verify-counts.sh
#
set -euo pipefail

TABLES="${VERIFY_TABLES:-_schema_migrations users shipments imported_po_intake purchase_orders refresh_tokens}"

count_psql() {
  local url="$1"
  local table="$2"
  psql "$url" -Atqc "SELECT COUNT(*) FROM ${table}" 2>/dev/null || echo "MISSING"
}

count_docker() {
  local table="$1"
  docker exec "$EOS_PG_CONTAINER" \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT COUNT(*) FROM ${table}" 2>/dev/null || echo "MISSING"
}

if [[ -z "${TARGET_URL:-${APSARA_DATABASE_URL:-}}" ]]; then
  echo "Set TARGET_URL or APSARA_DATABASE_URL" >&2
  exit 1
fi
TARGET="${TARGET_URL:-$APSARA_DATABASE_URL}"

echo "table	source	target"
fail=0
for table in $TABLES; do
  if [[ -n "${SOURCE_URL:-}" ]]; then
    src="$(count_psql "$SOURCE_URL" "$table")"
  elif [[ -n "${EOS_PG_CONTAINER:-}" && -n "${POSTGRES_USER:-}" && -n "${POSTGRES_DB:-}" ]]; then
    src="$(count_docker "$table")"
  else
    echo "Set SOURCE_URL or EOS_PG_CONTAINER + POSTGRES_USER + POSTGRES_DB" >&2
    exit 1
  fi
  dst="$(count_psql "$TARGET" "$table")"
  echo "${table}	${src}	${dst}"
  if [[ "$src" != "$dst" ]]; then
    fail=1
  fi
done

if [[ "$fail" -ne 0 ]]; then
  echo "[apsaradb] COUNT MISMATCH" >&2
  exit 1
fi
echo "[apsaradb] Counts match"
