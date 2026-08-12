import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import type {
  CommodityRow,
  CommodityJpsMappedRow,
  CreateCommodityDto,
  UpdateCommodityDto,
  ListCommoditiesQuery,
} from "../dto/index.js";

const COMMODITY_COLS =
  "id, short_name, name, commodity_type, jps_short_name, created_at, updated_at";

export class CommodityRepository {
  private get pool(): Pool {
    return getPool();
  }

  async listCommodities(query: ListCommoditiesQuery): Promise<CommodityRow[]> {
    const conditions = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search?.trim()) {
      conditions.push(
        `(short_name ILIKE $${idx} OR name ILIKE $${idx} OR jps_short_name ILIKE $${idx})`
      );
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

  async listJpsMappedCommodities(): Promise<CommodityJpsMappedRow[]> {
    const result = await this.pool.query<CommodityJpsMappedRow>(
      `SELECT id, short_name, name, commodity_type, jps_short_name
       FROM master_commodities
       WHERE deleted_at IS NULL
         AND jps_short_name IS NOT NULL
         AND TRIM(jps_short_name) <> ''
       ORDER BY LOWER(short_name) ASC`,
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
      `INSERT INTO master_commodities (short_name, name, commodity_type, jps_short_name, created_at, updated_at)
       VALUES (TRIM($1), TRIM($2), $3, $4, NOW(), NOW())
       RETURNING ${COMMODITY_COLS}`,
      [
        dto.short_name,
        dto.name,
        dto.commodity_type,
        dto.jps_short_name?.trim() ? dto.jps_short_name.trim() : null,
      ],
    );
    if (!result.rows[0]) throw new Error("CommodityRepository.createCommodity: no row returned");
    return result.rows[0];
  }

  async updateCommodity(id: string, dto: UpdateCommodityDto): Promise<CommodityRow | null> {
    const updates: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let idx = 1;
    if (dto.short_name !== undefined) {
      updates.push(`short_name = TRIM($${idx++})`);
      params.push(dto.short_name);
    }
    if (dto.name !== undefined) {
      updates.push(`name = TRIM($${idx++})`);
      params.push(dto.name);
    }
    if (dto.commodity_type !== undefined) {
      updates.push(`commodity_type = $${idx++}`);
      params.push(dto.commodity_type);
    }
    if (dto.jps_short_name !== undefined) {
      updates.push(`jps_short_name = $${idx++}`);
      params.push(
        dto.jps_short_name == null || !String(dto.jps_short_name).trim()
          ? null
          : String(dto.jps_short_name).trim(),
      );
    }
    if (params.length === 0) return this.getCommodityById(id);
    params.push(id);
    const result = await this.pool.query<CommodityRow>(
      `UPDATE master_commodities SET ${updates.join(", ")}
       WHERE id = $${idx} AND deleted_at IS NULL
       RETURNING ${COMMODITY_COLS}`,
      params,
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
