import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import type {
  ShipperRow,
  ShipperLoadportRow,
  CreateShipperDto,
  UpdateShipperDto,
  CreateShipperLoadportDto,
  UpdateShipperLoadportDto,
  ListShippersQuery,
} from "../dto/index.js";

const SHIPPER_COLS = "id, name, created_at, updated_at";
const LP_COLS = "id, shipper_id, name, created_at, updated_at";

export class ShipperRepository {
  private get pool(): Pool {
    return getPool();
  }

  /* ───────── shippers ───────── */

  async listShippers(query: ListShippersQuery): Promise<ShipperRow[]> {
    const conditions = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search?.trim()) {
      conditions.push(`name ILIKE $${idx++}`);
      params.push(`%${query.search.trim()}%`);
    }

    const where = conditions.join(" AND ");
    const result = await this.pool.query<ShipperRow>(
      `SELECT ${SHIPPER_COLS} FROM master_shippers WHERE ${where} ORDER BY LOWER(name) ASC`,
      params,
    );
    return result.rows;
  }

  async getShipperById(id: string): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `SELECT ${SHIPPER_COLS} FROM master_shippers WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findShipperByName(name: string): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `SELECT ${SHIPPER_COLS} FROM master_shippers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND deleted_at IS NULL`,
      [name],
    );
    return result.rows[0] ?? null;
  }

  async createShipper(dto: CreateShipperDto): Promise<ShipperRow> {
    const result = await this.pool.query<ShipperRow>(
      `INSERT INTO master_shippers (name, created_at, updated_at)
       VALUES (TRIM($1), NOW(), NOW())
       RETURNING ${SHIPPER_COLS}`,
      [dto.name],
    );
    if (!result.rows[0]) throw new Error("ShipperRepository.createShipper: no row returned");
    return result.rows[0];
  }

  async updateShipper(id: string, dto: UpdateShipperDto): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `UPDATE master_shippers SET name = TRIM($1), updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING ${SHIPPER_COLS}`,
      [dto.name, id],
    );
    return result.rows[0] ?? null;
  }

  async softDeleteShipper(id: string): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `UPDATE master_shippers SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${SHIPPER_COLS}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /* ───────── shipper loadports ───────── */

  async listLoadports(shipperId: string): Promise<ShipperLoadportRow[]> {
    const result = await this.pool.query<ShipperLoadportRow>(
      `SELECT ${LP_COLS} FROM shipper_loadports
       WHERE shipper_id = $1 AND deleted_at IS NULL
       ORDER BY LOWER(name) ASC`,
      [shipperId],
    );
    return result.rows;
  }

  async findLoadportByName(shipperId: string, name: string): Promise<ShipperLoadportRow | null> {
    const result = await this.pool.query<ShipperLoadportRow>(
      `SELECT ${LP_COLS} FROM shipper_loadports
       WHERE shipper_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND deleted_at IS NULL`,
      [shipperId, name],
    );
    return result.rows[0] ?? null;
  }

  async createLoadport(shipperId: string, dto: CreateShipperLoadportDto): Promise<ShipperLoadportRow> {
    const result = await this.pool.query<ShipperLoadportRow>(
      `INSERT INTO shipper_loadports (shipper_id, name, created_at, updated_at)
       VALUES ($1, TRIM($2), NOW(), NOW())
       RETURNING ${LP_COLS}`,
      [shipperId, dto.name],
    );
    if (!result.rows[0]) throw new Error("ShipperRepository.createLoadport: no row returned");
    return result.rows[0];
  }

  async updateLoadport(id: string, dto: UpdateShipperLoadportDto): Promise<ShipperLoadportRow | null> {
    const result = await this.pool.query<ShipperLoadportRow>(
      `UPDATE shipper_loadports SET name = TRIM($1), updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING ${LP_COLS}`,
      [dto.name, id],
    );
    return result.rows[0] ?? null;
  }

  async softDeleteLoadport(id: string): Promise<ShipperLoadportRow | null> {
    const result = await this.pool.query<ShipperLoadportRow>(
      `UPDATE shipper_loadports SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${LP_COLS}`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
