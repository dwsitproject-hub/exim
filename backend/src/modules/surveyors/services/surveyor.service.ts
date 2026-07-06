import { AppError } from "../../../middlewares/errorHandler.js";
import { SurveyorRepository } from "../repositories/surveyor.repository.js";
import type {
  SurveyorRow,
  CreateSurveyorDto,
  UpdateSurveyorDto,
  ListSurveyorsQuery,
} from "../dto/index.js";

export class SurveyorService {
  constructor(private readonly repo: SurveyorRepository) {}

  async listSurveyors(query: ListSurveyorsQuery): Promise<SurveyorRow[]> {
    return this.repo.listSurveyors(query);
  }

  async getSurveyorById(id: string): Promise<SurveyorRow | null> {
    return this.repo.getSurveyorById(id);
  }

  async createSurveyor(dto: CreateSurveyorDto): Promise<SurveyorRow> {
    if (!dto.name?.trim()) {
      throw new AppError("Surveyor name is required", 400);
    }
    const existing = await this.repo.findSurveyorByName(dto.name);
    if (existing) {
      return existing;
    }
    return this.repo.createSurveyor(dto);
  }

  async updateSurveyor(id: string, dto: UpdateSurveyorDto): Promise<SurveyorRow | null> {
    if (!dto.name?.trim()) {
      throw new AppError("Surveyor name is required", 400);
    }
    const existing = await this.repo.findSurveyorByName(dto.name);
    if (existing && existing.id !== id) {
      throw new AppError(`Surveyor "${dto.name.trim()}" already exists`, 409);
    }
    return this.repo.updateSurveyor(id, dto);
  }

  async softDeleteSurveyor(id: string): Promise<SurveyorRow | null> {
    return this.repo.softDeleteSurveyor(id);
  }
}
