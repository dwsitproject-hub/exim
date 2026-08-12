import { AppError } from "../../../middlewares/errorHandler.js";
import { CommodityRepository } from "../repositories/commodity.repository.js";
import type {
  CommodityRow,
  CommodityJpsMappedRow,
  CreateCommodityDto,
  UpdateCommodityDto,
  ListCommoditiesQuery,
  CommodityType,
} from "../dto/index.js";
import { COMMODITY_TYPES } from "../dto/index.js";

function assertCommodityType(value: string): CommodityType {
  if (!COMMODITY_TYPES.includes(value as CommodityType)) {
    throw new AppError("Commodity type must be Liquid or Solid", 400);
  }
  return value as CommodityType;
}

function validateFullCommodityFields(dto: {
  short_name?: string;
  name?: string;
  commodity_type?: string;
}): CommodityType {
  if (!dto.short_name?.trim()) {
    throw new AppError("Short commodity name is required", 400);
  }
  if (!dto.name?.trim()) {
    throw new AppError("Commodity name is required", 400);
  }
  if (!dto.commodity_type) {
    throw new AppError("Commodity type is required", 400);
  }
  return assertCommodityType(dto.commodity_type);
}

export class CommodityService {
  constructor(private readonly repo: CommodityRepository) {}

  async listCommodities(query: ListCommoditiesQuery): Promise<CommodityRow[]> {
    return this.repo.listCommodities(query);
  }

  async listJpsMappedCommodities(): Promise<CommodityJpsMappedRow[]> {
    return this.repo.listJpsMappedCommodities();
  }

  async getCommodityById(id: string): Promise<CommodityRow | null> {
    return this.repo.getCommodityById(id);
  }

  async createCommodity(dto: CreateCommodityDto): Promise<CommodityRow> {
    validateFullCommodityFields(dto);
    const existingShort = await this.repo.findCommodityByShortName(dto.short_name);
    if (existingShort) {
      return existingShort;
    }
    const existingName = await this.repo.findCommodityByName(dto.name);
    if (existingName) {
      throw new AppError(`Commodity name "${dto.name.trim()}" already exists`, 409);
    }
    return this.repo.createCommodity(dto);
  }

  async updateCommodity(id: string, dto: UpdateCommodityDto): Promise<CommodityRow | null> {
    const hasCore =
      dto.short_name !== undefined || dto.name !== undefined || dto.commodity_type !== undefined;
    const hasJps = dto.jps_short_name !== undefined;

    if (!hasCore && !hasJps) {
      throw new AppError("Provide fields to update", 400);
    }

    if (hasCore) {
      // Full edit path — require all core fields when any is sent (matches admin modal).
      const type = validateFullCommodityFields({
        short_name: dto.short_name,
        name: dto.name,
        commodity_type: dto.commodity_type,
      });
      dto.commodity_type = type;

      const existingShort = await this.repo.findCommodityByShortName(dto.short_name!);
      if (existingShort && existingShort.id !== id) {
        throw new AppError(`Short commodity name "${dto.short_name!.trim()}" already exists`, 409);
      }
      const existingName = await this.repo.findCommodityByName(dto.name!);
      if (existingName && existingName.id !== id) {
        throw new AppError(`Commodity name "${dto.name!.trim()}" already exists`, 409);
      }
    }

    return this.repo.updateCommodity(id, dto);
  }

  async softDeleteCommodity(id: string): Promise<CommodityRow | null> {
    return this.repo.softDeleteCommodity(id);
  }
}
