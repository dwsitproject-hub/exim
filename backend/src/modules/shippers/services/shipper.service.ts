import { AppError } from "../../../middlewares/errorHandler.js";
import { ShipperRepository } from "../repositories/shipper.repository.js";
import type {
  ShipperRow,
  ShipperPlantRow,
  ShipperLoadportRow,
  ShipperMasterRow,
  CreateShipperDto,
  UpdateShipperDto,
  CreateShipperPlantDto,
  UpdateShipperPlantDto,
  CreateShipperLoadportDto,
  UpdateShipperLoadportDto,
  ListShippersQuery,
} from "../dto/index.js";

function validateShipperFields(dto: CreateShipperDto | UpdateShipperDto): void {
  if (!dto.entity_name?.trim()) {
    throw new AppError("Entity name is required", 400);
  }
  if (!dto.short_name?.trim()) {
    throw new AppError("Entity short name is required", 400);
  }
}

export class ShipperService {
  constructor(private readonly repo: ShipperRepository) {}

  /* ───────── shippers ───────── */

  async listShippers(query: ListShippersQuery): Promise<ShipperRow[]> {
    return this.repo.listShippers(query);
  }

  async listShippersMaster(query: ListShippersQuery): Promise<ShipperMasterRow[]> {
    return this.repo.listShippersMaster(query);
  }

  async getShipperById(id: string): Promise<ShipperRow | null> {
    return this.repo.getShipperById(id);
  }

  async createShipper(dto: CreateShipperDto): Promise<ShipperRow> {
    validateShipperFields(dto);
    const existingShort = await this.repo.findShipperByShortName(dto.short_name);
    if (existingShort) {
      throw new AppError(`Entity short name "${dto.short_name.trim()}" already exists`, 409);
    }
    const existingEntity = await this.repo.findShipperByEntityName(dto.entity_name);
    if (existingEntity) {
      throw new AppError(`Entity name "${dto.entity_name.trim()}" already exists`, 409);
    }
    return this.repo.createShipper(dto);
  }

  async updateShipper(id: string, dto: UpdateShipperDto): Promise<ShipperRow | null> {
    validateShipperFields(dto);
    const existingShort = await this.repo.findShipperByShortName(dto.short_name);
    if (existingShort && existingShort.id !== id) {
      throw new AppError(`Entity short name "${dto.short_name.trim()}" already exists`, 409);
    }
    const existingEntity = await this.repo.findShipperByEntityName(dto.entity_name);
    if (existingEntity && existingEntity.id !== id) {
      throw new AppError(`Entity name "${dto.entity_name.trim()}" already exists`, 409);
    }
    return this.repo.updateShipper(id, dto);
  }

  async softDeleteShipper(id: string): Promise<ShipperRow | null> {
    return this.repo.softDeleteShipper(id);
  }

  /* ───────── plants ───────── */

  async listPlants(shipperId: string): Promise<ShipperPlantRow[]> {
    return this.repo.listPlants(shipperId);
  }

  async createPlant(shipperId: string, dto: CreateShipperPlantDto): Promise<ShipperPlantRow> {
    if (!dto.name?.trim()) {
      throw new AppError("Plant name is required", 400);
    }
    const shipper = await this.repo.getShipperById(shipperId);
    if (!shipper) {
      throw new AppError("Shipper not found", 404);
    }
    const existing = await this.repo.findPlantByName(shipperId, dto.name);
    if (existing) {
      return existing;
    }
    return this.repo.createPlant(shipperId, dto);
  }

  async updatePlant(id: string, dto: UpdateShipperPlantDto): Promise<ShipperPlantRow | null> {
    if (!dto.name?.trim()) {
      throw new AppError("Plant name is required", 400);
    }
    return this.repo.updatePlant(id, dto);
  }

  async softDeletePlant(id: string): Promise<ShipperPlantRow | null> {
    return this.repo.softDeletePlant(id);
  }

  /* ───────── loadports ───────── */

  async listLoadports(shipperId: string): Promise<ShipperLoadportRow[]> {
    return this.repo.listLoadports(shipperId);
  }

  async createLoadport(shipperId: string, dto: CreateShipperLoadportDto): Promise<ShipperLoadportRow> {
    if (!dto.name?.trim()) {
      throw new AppError("Load port name is required", 400);
    }
    const shipper = await this.repo.getShipperById(shipperId);
    if (!shipper) {
      throw new AppError("Shipper not found", 404);
    }
    const existing = await this.repo.findLoadportByName(shipperId, dto.name);
    if (existing) {
      return existing;
    }
    return this.repo.createLoadport(shipperId, dto);
  }

  async updateLoadport(id: string, dto: UpdateShipperLoadportDto): Promise<ShipperLoadportRow | null> {
    if (!dto.name?.trim()) {
      throw new AppError("Load port name is required", 400);
    }
    return this.repo.updateLoadport(id, dto);
  }

  async softDeleteLoadport(id: string): Promise<ShipperLoadportRow | null> {
    return this.repo.softDeleteLoadport(id);
  }
}
