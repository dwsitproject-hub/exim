import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import type {
  CommodityRow,
  CreateCommodityDto,
  UpdateCommodityDto,
  ListCommoditiesQuery,
} from "../dto/index.js";

const COMMODITY_COLS = "id, short_name, name, commodity_type, created_at, updated_at";

export class CommodityRepository {
  private get pool(): Pool {
    return getPool();
  }

  async listCommodities(query: ListCommoditiesQuery): Promise<CommodityRow[]> {
    const conditions = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search?.trim()) {
      conditions.push(`(short_name ILIKE $${idx} OR name ILIKE $${idx})`);
      params.push(`%${query.search.trim()}%`);
      idx++;
    }

    const where = conditions.join(" AND ");
    const result = await this.pool.query<CommodityRow>(
      `SELECT ${COMMODITY_COLS} FROM master_commodities WHERE ${where} ORDER BY LOWER(short_name) ASC`,
      params,
    );
    return result.rows;
  }

  async getCommodityById(id: string): Promise<CommodityRow | null> {
    const result = await this.pool.query<CommodityRow>(
      `SELECT ${COMMODITY_COLS} FROM master_commodities WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findCommodityByShortName(shortName: string): Promise<CommodityRow | null> {
    const result = await this.pool.query<CommodityRow>(
      `SELECT ${COMMODITY_COLS} FROM master_commodities
       WHERE LOWER(TRIM(short_name)) = LOWER(TRIM($1)) AND deleted_at IS NULL`,
      [shortName],
    );
    return result.rows[0] ?? null;
  }

  async findCommodityByName(name: string): Promise<CommodityRow | null> {
    const result = await this.pool.query<CommodityRow>(
      `SELECT ${COMMODITY_COLS} FROM master_commodities
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND deleted_at IS NULL`,
      [name],
    );
    return result.rows[0] ?? null;
  }

  async createCommodity(dto: CreateCommodityDto): Promise<CommodityRow> {
    const result = await this.pool.query<CommodityRow>(
      `INSERT INTO master_commodities (short_name, name, commodity_type, created_at, updated_at)
       VALUES (TRIM($1), TRIM($2), $3, NOW(), NOW())
       RETURNING ${COMMODITY_COLS}`,
      [dto.short_name, dto.name, dto.commodity_type],
    );
    if (!result.rows[0]) throw new Error("CommodityRepository.createCommodity: no row returned");
    return result.rows[0];
  }

  async updateCommodity(id: string, dto: UpdateCommodityDto): Promise<CommodityRow | null> {
    const result = await this.pool.query<CommodityRow>(
      `UPDATE master_commodities
       SET short_name = TRIM($1), name = TRIM($2), commodity_type = $3, updated_at = NOW()
       WHERE id = $4 AND deleted_at IS NULL
       RETURNING ${COMMODITY_COLS}`,
      [dto.short_name, dto.name, dto.commodity_type, id],
    );
    return result.rows[0] ?? null;
  }

  async softDeleteCommodity(id: string): Promise<CommodityRow | null> {
    const result = await this.pool.query<CommodityRow>(
      `UPDATE master_commodities SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${COMMODITY_COLS}`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
