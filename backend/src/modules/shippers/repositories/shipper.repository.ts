import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
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

const SHIPPER_COLS = "id, entity_name, short_name, name, created_at, updated_at";
const PLANT_COLS = "id, shipper_id, name, created_at, updated_at";
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
      conditions.push(
        `(entity_name ILIKE $${idx} OR short_name ILIKE $${idx} OR name ILIKE $${idx})`,
      );
      params.push(`%${query.search.trim()}%`);
      idx++;
    }

    const where = conditions.join(" AND ");
    const result = await this.pool.query<ShipperRow>(
      `SELECT ${SHIPPER_COLS} FROM master_shippers WHERE ${where} ORDER BY LOWER(short_name) ASC`,
      params,
    );
    return result.rows;
  }

  async listShippersMaster(query: ListShippersQuery): Promise<ShipperMasterRow[]> {
    const shippers = await this.listShippers(query);
    if (shippers.length === 0) return [];

    const ids = shippers.map((s) => s.id);
    const [plantsRes, loadportsRes] = await Promise.all([
      this.pool.query<{ shipper_id: string; name: string }>(
        `SELECT shipper_id, name FROM shipper_plants
         WHERE shipper_id = ANY($1::uuid[]) AND deleted_at IS NULL
         ORDER BY LOWER(name) ASC`,
        [ids],
      ),
      this.pool.query<{ shipper_id: string; name: string }>(
        `SELECT shipper_id, name FROM shipper_loadports
         WHERE shipper_id = ANY($1::uuid[]) AND deleted_at IS NULL
         ORDER BY LOWER(name) ASC`,
        [ids],
      ),
    ]);

    const plantsByShipper = new Map<string, string[]>();
    for (const row of plantsRes.rows) {
      const list = plantsByShipper.get(row.shipper_id) ?? [];
      list.push(row.name);
      plantsByShipper.set(row.shipper_id, list);
    }

    const loadportsByShipper = new Map<string, string[]>();
    for (const row of loadportsRes.rows) {
      const list = loadportsByShipper.get(row.shipper_id) ?? [];
      list.push(row.name);
      loadportsByShipper.set(row.shipper_id, list);
    }

    return shippers.map((shipper) => ({
      ...shipper,
      plants: plantsByShipper.get(shipper.id) ?? [],
      loadports: loadportsByShipper.get(shipper.id) ?? [],
    }));
  }

  async getShipperById(id: string): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `SELECT ${SHIPPER_COLS} FROM master_shippers WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async findShipperByShortName(shortName: string): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `SELECT ${SHIPPER_COLS} FROM master_shippers
       WHERE LOWER(TRIM(short_name)) = LOWER(TRIM($1)) AND deleted_at IS NULL`,
      [shortName],
    );
    return result.rows[0] ?? null;
  }

  async findShipperByEntityName(entityName: string): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `SELECT ${SHIPPER_COLS} FROM master_shippers
       WHERE LOWER(TRIM(entity_name)) = LOWER(TRIM($1)) AND deleted_at IS NULL`,
      [entityName],
    );
    return result.rows[0] ?? null;
  }

  async createShipper(dto: CreateShipperDto): Promise<ShipperRow> {
    const result = await this.pool.query<ShipperRow>(
      `INSERT INTO master_shippers (entity_name, short_name, name, created_at, updated_at)
       VALUES (TRIM($1), TRIM($2), TRIM($2), NOW(), NOW())
       RETURNING ${SHIPPER_COLS}`,
      [dto.entity_name, dto.short_name],
    );
    if (!result.rows[0]) throw new Error("ShipperRepository.createShipper: no row returned");
    return result.rows[0];
  }

  async updateShipper(id: string, dto: UpdateShipperDto): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `UPDATE master_shippers
       SET entity_name = TRIM($1), short_name = TRIM($2), name = TRIM($2), updated_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING ${SHIPPER_COLS}`,
      [dto.entity_name, dto.short_name, id],
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

  /* ───────── plants ───────── */

  async listPlants(shipperId: string): Promise<ShipperPlantRow[]> {
    const result = await this.pool.query<ShipperPlantRow>(
      `SELECT ${PLANT_COLS} FROM shipper_plants
       WHERE shipper_id = $1 AND deleted_at IS NULL
       ORDER BY LOWER(name) ASC`,
      [shipperId],
    );
    return result.rows;
  }

  async findPlantByName(shipperId: string, name: string): Promise<ShipperPlantRow | null> {
    const result = await this.pool.query<ShipperPlantRow>(
      `SELECT ${PLANT_COLS} FROM shipper_plants
       WHERE shipper_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND deleted_at IS NULL`,
      [shipperId, name],
    );
    return result.rows[0] ?? null;
  }

  async createPlant(shipperId: string, dto: CreateShipperPlantDto): Promise<ShipperPlantRow> {
    const result = await this.pool.query<ShipperPlantRow>(
      `INSERT INTO shipper_plants (shipper_id, name, created_at, updated_at)
       VALUES ($1, TRIM($2), NOW(), NOW())
       RETURNING ${PLANT_COLS}`,
      [shipperId, dto.name],
    );
    if (!result.rows[0]) throw new Error("ShipperRepository.createPlant: no row returned");
    return result.rows[0];
  }

  async updatePlant(id: string, dto: UpdateShipperPlantDto): Promise<ShipperPlantRow | null> {
    const result = await this.pool.query<ShipperPlantRow>(
      `UPDATE shipper_plants SET name = TRIM($1), updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING ${PLANT_COLS}`,
      [dto.name, id],
    );
    return result.rows[0] ?? null;
  }

  async softDeletePlant(id: string): Promise<ShipperPlantRow | null> {
    const result = await this.pool.query<ShipperPlantRow>(
      `UPDATE shipper_plants SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${PLANT_COLS}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /* ───────── loadports ───────── */

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
