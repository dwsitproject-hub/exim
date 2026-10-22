import { getPool } from "../../../db/index.js";

export class PoIntakeViewRepository {
  async recordView(userId: string, intakeId: string): Promise<void> {
    const pool = getPool();
    await pool.query(
      `INSERT INTO po_intake_user_views (user_id, intake_id, first_viewed_at)
       VALUES ($1::uuid, $2::uuid, NOW())
       ON CONFLICT (user_id, intake_id) DO NOTHING`,
      [userId, intakeId]
    );
  }

  async findViewedIntakeIds(userId: string, intakeIds: string[]): Promise<Set<string>> {
    if (intakeIds.length === 0) return new Set();
    const pool = getPool();
    const result = await pool.query<{ intake_id: string }>(
      `SELECT intake_id::text AS intake_id FROM po_intake_user_views
       WHERE user_id = $1::uuid AND intake_id = ANY($2::uuid[])`,
      [userId, intakeIds]
    );
    return new Set(result.rows.map((r) => r.intake_id));
  }
}
