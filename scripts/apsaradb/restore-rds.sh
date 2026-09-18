#!/usr/bin/env bash
#
# Restore a --no-owner --no-acl plain dump into an empty ApsaraDB database.
# Usage: APSARA_DATABASE_URL=... ./restore-rds.sh dump.sql.gz
#
# Do not restore a staging dump into the production database.
#
set -euo pipefail

URL="${APSARA_DATABASE_URL:-${DATABASE_URL:-}}"
DUMP="${1:-}"

if [[ -z "$URL" ]]; then
  echo "Set APSARA_DATABASE_URL or DATABASE_URL" >&2
  exit 1
fi
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 /path/to/dump.sql.gz" >&2
  exit 1
fi

echo "[apsaradb] Restoring $DUMP -> target"
gunzip -c "$DUMP" | psql --set ON_ERROR_STOP=1 "$URL"
echo "[apsaradb] Restore finished"
