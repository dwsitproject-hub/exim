# ApsaraDB dump / restore helpers

Run these on the **backend ECS** (staging first).

- Staging dump → restore only: [docs/APSARADB-STAGING-DUMP-RESTORE.md](../../docs/APSARADB-STAGING-DUMP-RESTORE.md)
- Full cutover (point backend at RDS, soak, production): [docs/APSARADB-MIGRATION.md](../../docs/APSARADB-MIGRATION.md)

| Script | Purpose |
|--------|---------|
| `check-rds.sh` | `SELECT version()` against `APSARA_DATABASE_URL` |
| `dump-docker.sh` | `pg_dump --no-owner --no-acl` from a PG 16 container |
| `restore-rds.sh` | Restore a gzip dump into an empty RDS database |
| `verify-counts.sh` | Compare core table counts source vs target |
| `cutover.sh` | `EOS_MIGRATE_ENV=staging\|production` wrapper: `dump\|restore\|verify\|all` |

Requires `psql` / `pg_dump` on the host for RDS calls (`postgresql-client`). The dump script uses `pg_dump` **inside** the source container (PG 16).
