import { AppError } from "../../../middlewares/errorHandler.js";
import { ShipperRepository } from "../repositories/shipper.repository.js";
import type {
  ShipperRow,
  ShipperLoadportRow,
  CreateShipperDto,
  UpdateShipperDto,
  CreateShipperLoadportDto,
  UpdateShipperLoadportDto,
  ListShippersQuery,
} from "../dto/index.js";

export class ShipperService {
  constructor(private readonly repo: ShipperRepository) {}

  /* ───────── shippers ───────── */

  async listShippers(query: ListShippersQuery): Promise<ShipperRow[]> {
    return this.repo.listShippers(query);
  }

  async getShipperById(id: string): Promise<ShipperRow | null> {
    return this.repo.getShipperById(id);
  }

  async createShipper(dto: CreateShipperDto): Promise<ShipperRow> {
    if (!dto.name?.trim()) {
      throw new AppError("Shipper name is required", 400);
    }
    const existing = await this.repo.findShipperByName(dto.name);
    if (existing) {
      throw new AppError(`Shipper "${dto.name.trim()}" already exists`, 409);
    }
    return this.repo.createShipper(dto);
  }

  async updateShipper(id: string, dto: UpdateShipperDto): Promise<ShipperRow | null> {
    if (!dto.name?.trim()) {
      throw new AppError("Shipper name is required", 400);
    }
    const existing = await this.repo.findShipperByName(dto.name);
    if (existing && existing.id !== id) {
      throw new AppError(`Shipper "${dto.name.trim()}" already exists`, 409);
    }
    return this.repo.updateShipper(id, dto);
  }

  async softDeleteShipper(id: string): Promise<ShipperRow | null> {
    return this.repo.softDeleteShipper(id);
  }

  /* ───────── shipper loadports ───────── */

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
