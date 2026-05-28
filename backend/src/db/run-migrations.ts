/**
 * Run all SQL migration files in order (001_, 002_, ...).
 * Each file is applied at most once (recorded in _schema_migrations).
 * Requires DATABASE_URL. Run from backend directory: npm run migrate.
 */

import "./load-env.js";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { getPool, closeDb } from "./index.js";

const MIGRATIONS_DIR = join(process.cwd(), "src", "db", "migrations");

async function run(): Promise<void> {
  const pool = getPool();
  const files = await readdir(MIGRATIONS_DIR);
  const sqlFiles = files
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (sqlFiles.length === 0) {
    console.log("No migration files found.");
    await closeDb();
    process.exit(0);
    return;
  }

  const client = await pool.connect();
  let exitCode = 0;
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const file of sqlFiles) {
      const { rows: applied } = await client.query(
        `SELECT 1 AS ok FROM _schema_migrations WHERE filename = $1`,
        [file]
      );
      if (applied.length > 0) {
        console.log(`Skip (already applied): ${file}`);
        continue;
      }

      const filePath = join(MIGRATIONS_DIR, file);
      const sql = await readFile(filePath, "utf-8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
      console.log(`Applied: ${file}`);
    }
    console.log("Migrations completed.");
  } catch (err) {
    console.error("Migration failed:", err);
    exitCode = 1;
  } finally {
    client.release();
    await closeDb();
    process.exit(exitCode);
  }
}

run();
