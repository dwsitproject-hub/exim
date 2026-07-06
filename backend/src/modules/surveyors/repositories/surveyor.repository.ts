import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import type {
  SurveyorRow,
  CreateSurveyorDto,
  UpdateSurveyorDto,
  ListSurveyorsQuery,
} from "../dto/index.js";

const SURVEYOR_COLS = "id, name, created_at, updated_at";

export class SurveyorRepository {
  private get pool(): Pool {
    return getPool();
  }

  async listSurveyors(query: ListSurveyorsQuery): Promise<SurveyorRow[]> {
    const conditions = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search?.trim()) {
      conditions.push(`name ILIKE $${idx++}`);
      params.push(`%${query.search.trim()}%`);
    }

    const where = conditions.join(" AND ");
    const result = await this.pool.query<SurveyorRow>(
      `SELECT ${SURVEYOR_COLS} FROM master_surveyors WHERE ${where} ORDER BY LOWER(name) ASC`,
      params,
    );
    return result.rows;
  }

  async getSurveyorById(id: string): Promise<SurveyorRow | null> {
    const result = await this.pool.query<SurveyorRow>(
      `SELECT ${SURVEYOR_COLS} FROM master_surveyors WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findSurveyorByName(name: string): Promise<SurveyorRow | null> {
    const result = await this.pool.query<SurveyorRow>(
      `SELECT ${SURVEYOR_COLS} FROM master_surveyors WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND deleted_at IS NULL`,
      [name],
    );
    return result.rows[0] ?? null;
  }

  async createSurveyor(dto: CreateSurveyorDto): Promise<SurveyorRow> {
    const result = await this.pool.query<SurveyorRow>(
      `INSERT INTO master_surveyors (name, created_at, updated_at)
       VALUES (TRIM($1), NOW(), NOW())
       RETURNING ${SURVEYOR_COLS}`,
      [dto.name],
    );
    if (!result.rows[0]) throw new Error("SurveyorRepository.createSurveyor: no row returned");
    return result.rows[0];
  }

  async updateSurveyor(id: string, dto: UpdateSurveyorDto): Promise<SurveyorRow | null> {
    const result = await this.pool.query<SurveyorRow>(
      `UPDATE master_surveyors SET name = TRIM($1), updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING ${SURVEYOR_COLS}`,
      [dto.name, id],
    );
    return result.rows[0] ?? null;
  }

  async softDeleteSurveyor(id: string): Promise<SurveyorRow | null> {
    const result = await this.pool.query<SurveyorRow>(
      `UPDATE master_surveyors SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${SURVEYOR_COLS}`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
