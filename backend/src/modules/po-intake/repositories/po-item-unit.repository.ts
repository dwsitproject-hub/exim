/**
 * PO line unit codes — persistence for dynamic unit registry.
 */

import { getPool } from "../../../db/index.js";

export class PoItemUnitRepository {
  async findAllCodes(): Promise<string[]> {
    const pool = getPool();
    const result = await pool.query<{ code: string }>(
      `SELECT code FROM po_item_unit_codes ORDER BY code ASC`
    );
    return result.rows.map((r) => r.code);
  }

  async insertIgnore(code: string, source: "seed" | "syncera"): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO po_item_unit_codes (code, source)
       VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING`,
      [code, source]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
