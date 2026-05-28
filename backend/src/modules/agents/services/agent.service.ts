import { AppError } from "../../../middlewares/errorHandler.js";
import { AgentRepository } from "../repositories/agent.repository.js";
import type {
  AgentRow,
  CreateAgentDto,
  UpdateAgentDto,
  ListAgentsQuery,
} from "../dto/index.js";

export class AgentService {
  constructor(private readonly repo: AgentRepository) {}

  async listAgents(query: ListAgentsQuery): Promise<AgentRow[]> {
    return this.repo.listAgents(query);
  }

  async getAgentById(id: string): Promise<AgentRow | null> {
    return this.repo.getAgentById(id);
  }

  async createAgent(dto: CreateAgentDto): Promise<AgentRow> {
    if (!dto.name?.trim()) {
      throw new AppError("Agent name is required", 400);
    }
    const existing = await this.repo.findAgentByName(dto.name);
    if (existing) {
      return existing;
    }
    return this.repo.createAgent(dto);
  }

  async updateAgent(id: string, dto: UpdateAgentDto): Promise<AgentRow | null> {
    if (!dto.name?.trim()) {
      throw new AppError("Agent name is required", 400);
    }
    const existing = await this.repo.findAgentByName(dto.name);
    if (existing && existing.id !== id) {
      throw new AppError(`Agent "${dto.name.trim()}" already exists`, 409);
    }
    return this.repo.updateAgent(id, dto);
  }

  async softDeleteAgent(id: string): Promise<AgentRow | null> {
    return this.repo.softDeleteAgent(id);
  }
}
