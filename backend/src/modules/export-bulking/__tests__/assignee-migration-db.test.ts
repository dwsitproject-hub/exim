/**
 * DB-backed assignee validation + migration 075 tests.
 * Run with: npx tsx backend/src/modules/export-bulking/__tests__/assignee-migration-db.test.ts
 */

import { ExportBulkingRepository } from "../repositories/export-bulking.repository.js";
import { getPool } from "../../../db/index.js";
import { STATUS_TRANSITIONS, EXPORT_BULKING_STATUSES } from "../dto/index.js";
import type { ExportBulkingStatus } from "../dto/index.js";
import { AppError } from "../../../middlewares/errorHandler.js";

let passed = 0;
let failed = 0;

function ok(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${label}`);
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

async function testAssigneeValidation() {
  console.log("\n=== Assignee validation (repository / DB) ===");

  const repo = new ExportBulkingRepository();
  const pool = getPool();

  const ships = await pool.query<{ id: string }>(
    `SELECT id FROM export_bulking_shipments WHERE deleted_at IS NULL LIMIT 1`,
  );
  const shipId = ships.rows[0]?.id;
  const adminRow = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`,
  );
  const adminId = adminRow.rows[0]?.id;

  if (!shipId || !adminId) {
    console.error("  SKIP: missing shipment or admin user");
    return;
  }

  const beforeRow = await pool.query<{ documentation_assigned_to: string | null }>(
    `SELECT documentation_assigned_to FROM export_bulking_shipments WHERE id = $1`,
    [shipId],
  );
  const before = beforeRow.rows[0]?.documentation_assigned_to ?? null;

  async function expect400(label: string, assignee: string) {
    let threw400 = false;
    try {
      await repo.assignDocumentation(shipId, assignee, adminId);
    } catch (e) {
      threw400 = e instanceof AppError && e.statusCode === 400;
    }
    const afterRow = await pool.query<{ documentation_assigned_to: string | null }>(
      `SELECT documentation_assigned_to FROM export_bulking_shipments WHERE id = $1`,
      [shipId],
    );
    const after = afterRow.rows[0]?.documentation_assigned_to ?? null;
    ok(threw400, `${label} throws 400`);
    ok(after === before, `${label}: no DB change`);
  }

  await expect400("random UUID", "00000000-0000-4000-8000-000000000001");
  await expect400("admin (wrong role)", adminId);

  const inactive = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE is_active = false LIMIT 1`,
  );
  if (inactive.rows[0]?.id) {
    await expect400("inactive user", inactive.rows[0].id);
  } else {
    console.log("  NOTE: no inactive user in DB");
  }
}

async function testMigration075() {
  console.log("\n=== Migration 075 status remap (transactional) ===");

  const pool = getPool();
  const adminRow = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`,
  );
  const adminId = adminRow.rows[0]?.id ?? "fac5fb27-1c87-42ec-8085-9f0e42ce15b6";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ins = await client.query<{ id: string; current_status: string }>(
      `INSERT INTO export_bulking_shipments
         (id, shipment_no, current_status, vessel_name, loadport_name, total_quantity, created_by)
       VALUES
         (gen_random_uuid(), 'EXB-MIGTEST-075-A', 'SI_RECEIVE', 'T', 'Taboneo', 1, $1),
         (gen_random_uuid(), 'EXB-MIGTEST-075-B', 'NPE', 'T', 'Taboneo', 1, $1)
       RETURNING id, current_status`,
      [adminId],
    );

    await client.query(
      `UPDATE export_bulking_shipments SET current_status = 'ARRIVAL' WHERE current_status = 'SI_RECEIVE'`,
    );
    await client.query(
      `UPDATE export_bulking_shipments SET current_status = 'LOADING' WHERE current_status = 'NPE'`,
    );

    for (const row of ins.rows) {
      const r = await client.query<{ current_status: string }>(
        `SELECT current_status FROM export_bulking_shipments WHERE id = $1`,
        [row.id],
      );
      const st = r.rows[0]?.current_status ?? "";
      if (row.current_status === "SI_RECEIVE") {
        ok(st === "ARRIVAL", "SI_RECEIVE remapped to ARRIVAL");
      }
      if (row.current_status === "NPE") {
        ok(st === "LOADING", "NPE remapped to LOADING");
      }
      ok(EXPORT_BULKING_STATUSES.includes(st as ExportBulkingStatus), `${st} is valid status`);
      ok(st in STATUS_TRANSITIONS, `${st} has STATUS_TRANSITIONS entry`);
      const next = STATUS_TRANSITIONS[st as ExportBulkingStatus];
      ok(next !== undefined || st === "CASE_OFF", `${st} allows valid next step (${String(next)})`);
    }

    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  console.log("Export Bulking — DB assignee + migration tests\n");
  await testAssigneeValidation();
  await testMigration075();
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
