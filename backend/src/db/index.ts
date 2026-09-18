/**
 * Database connection setup (PostgreSQL).
 * Migration-ready: run migrations separately via npm run migrate.
 */

import pg from "pg";
import { config } from "../config/index.js";
import { resolvePoolSslOptions } from "./pool-ssl.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function resolvePoolSsl(): boolean | { rejectUnauthorized: boolean } {
  return resolvePoolSslOptions({
    url: config.database.url,
    ssl: config.database.ssl,
    sslRejectUnauthorized: config.database.sslRejectUnauthorized,
  });
}

export function getPool(): pg.Pool {
  if (!pool) {
    const ssl = resolvePoolSsl();
    pool = new Pool({
      connectionString: config.database.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ...(ssl === false ? {} : { ssl }),
    });
  }
  return pool;
}

export async function connectDb(): Promise<pg.Pool> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
  return p;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
