#!/usr/bin/env bash
#
# Connectivity smoke test against ApsaraDB (run from the backend ECS, not a laptop).
# Requires: psql, APSARA_DATABASE_URL (or DATABASE_URL)
#
set -euo pipefail

URL="${APSARA_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "Set APSARA_DATABASE_URL or DATABASE_URL" >&2
  exit 1
fi

echo "[apsaradb] SELECT version() ..."
psql "$URL" -c "SELECT version();"
echo "[apsaradb] OK"
