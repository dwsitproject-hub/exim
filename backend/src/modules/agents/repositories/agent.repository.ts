import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import type {
  AgentRow,
  CreateAgentDto,
  UpdateAgentDto,
  ListAgentsQuery,
} from "../dto/index.js";

const AGENT_COLS = "id, name, created_at, updated_at";

export class AgentRepository {
  private get pool(): Pool {
    return getPool();
  }

  async listAgents(query: ListAgentsQuery): Promise<AgentRow[]> {
    const conditions = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    let idx = 1;

    if (query.search?.trim()) {
      conditions.push(`name ILIKE $${idx++}`);
      params.push(`%${query.search.trim()}%`);
    }

    const where = conditions.join(" AND ");
    const result = await this.pool.query<AgentRow>(
      `SELECT ${AGENT_COLS} FROM master_agents WHERE ${where} ORDER BY LOWER(name) ASC`,
      params,
    );
    return result.rows;
  }

  async getAgentById(id: string): Promise<AgentRow | null> {
    const result = await this.pool.query<AgentRow>(
      `SELECT ${AGENT_COLS} FROM master_agents WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findAgentByName(name: string): Promise<AgentRow | null> {
    const result = await this.pool.query<AgentRow>(
      `SELECT ${AGENT_COLS} FROM master_agents WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND deleted_at IS NULL`,
      [name],
    );
    return result.rows[0] ?? null;
  }

  async createAgent(dto: CreateAgentDto): Promise<AgentRow> {
    const result = await this.pool.query<AgentRow>(
      `INSERT INTO master_agents (name, created_at, updated_at)
       VALUES (TRIM($1), NOW(), NOW())
       RETURNING ${AGENT_COLS}`,
      [dto.name],
    );
    if (!result.rows[0]) throw new Error("AgentRepository.createAgent: no row returned");
    return result.rows[0];
  }

  async updateAgent(id: string, dto: UpdateAgentDto): Promise<AgentRow | null> {
    const result = await this.pool.query<AgentRow>(
      `UPDATE master_agents SET name = TRIM($1), updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING ${AGENT_COLS}`,
      [dto.name, id],
    );
    return result.rows[0] ?? null;
  }

  async softDeleteAgent(id: string): Promise<AgentRow | null> {
    const result = await this.pool.query<AgentRow>(
      `UPDATE master_agents SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${AGENT_COLS}`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
