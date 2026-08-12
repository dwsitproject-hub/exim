import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import type {
  ShipperRow,
  ShipperPlantRow,
  ShipperPlantUnloadPortRow,
  ShipperLoadportRow,
  ShipperMasterRow,
  CreateShipperDto,
  UpdateShipperDto,
  CreateShipperPlantDto,
  UpdateShipperPlantDto,
  CreateShipperPlantUnloadPortDto,
  UpdateShipperPlantUnloadPortDto,
  CreateShipperLoadportDto,
  UpdateShipperLoadportDto,
  ListShippersQuery,
} from "../dto/index.js";

const SHIPPER_COLS = `id, entity_name, short_name, name,
  (document_header_storage_key IS NOT NULL) AS has_document_header,
  document_header_file_name, document_header_mime_type,
  npwp, created_at, updated_at`;
const PLANT_COLS = "id, shipper_id, name, created_at, updated_at";
const UNLOAD_PORT_COLS = "id, plant_id, name, jps_port_id, created_at, updated_at";
const LP_COLS = "id, shipper_id, name, jps_port_id, created_at, updated_at";

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
      `INSERT INTO master_shippers (entity_name, short_name, name, npwp, created_at, updated_at)
       VALUES (TRIM($1), TRIM($2), TRIM($2), NULLIF(TRIM($3), ''), NOW(), NOW())
       RETURNING ${SHIPPER_COLS}`,
      [dto.entity_name, dto.short_name, dto.npwp ?? ""],
    );
    if (!result.rows[0]) throw new Error("ShipperRepository.createShipper: no row returned");
    return result.rows[0];
  }

  async updateShipper(id: string, dto: UpdateShipperDto): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `UPDATE master_shippers
       SET entity_name = TRIM($1), short_name = TRIM($2), name = TRIM($2),
           npwp = NULLIF(TRIM($3), ''), updated_at = NOW()
       WHERE id = $4 AND deleted_at IS NULL
       RETURNING ${SHIPPER_COLS}`,
      [dto.entity_name, dto.short_name, dto.npwp ?? "", id],
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
    await this.pool.query(
      `UPDATE shipper_plant_unload_ports SET deleted_at = NOW(), updated_at = NOW()
       WHERE plant_id = $1 AND deleted_at IS NULL`,
      [id],
    );
    const result = await this.pool.query<ShipperPlantRow>(
      `UPDATE shipper_plants SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${PLANT_COLS}`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /* ───────── plant unload ports (import) ───────── */

  async listUnloadPortsByPlant(plantId: string): Promise<ShipperPlantUnloadPortRow[]> {
    const result = await this.pool.query<ShipperPlantUnloadPortRow>(
      `SELECT ${UNLOAD_PORT_COLS} FROM shipper_plant_unload_ports
       WHERE plant_id = $1 AND deleted_at IS NULL
       ORDER BY LOWER(name) ASC`,
      [plantId],
    );
    return result.rows;
  }

  async findUnloadPortByName(
    plantId: string,
    name: string,
  ): Promise<ShipperPlantUnloadPortRow | null> {
    const result = await this.pool.query<ShipperPlantUnloadPortRow>(
      `SELECT ${UNLOAD_PORT_COLS} FROM shipper_plant_unload_ports
       WHERE plant_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND deleted_at IS NULL`,
      [plantId, name],
    );
    return result.rows[0] ?? null;
  }

  async getPlantById(plantId: string): Promise<ShipperPlantRow | null> {
    const result = await this.pool.query<ShipperPlantRow>(
      `SELECT ${PLANT_COLS} FROM shipper_plants
       WHERE id = $1 AND deleted_at IS NULL`,
      [plantId],
    );
    return result.rows[0] ?? null;
  }

  async createUnloadPort(
    plantId: string,
    dto: CreateShipperPlantUnloadPortDto,
  ): Promise<ShipperPlantUnloadPortRow> {
    const result = await this.pool.query<ShipperPlantUnloadPortRow>(
      `INSERT INTO shipper_plant_unload_ports (plant_id, name, jps_port_id, created_at, updated_at)
       VALUES ($1, TRIM($2), $3, NOW(), NOW())
       RETURNING ${UNLOAD_PORT_COLS}`,
      [plantId, dto.name, dto.jps_port_id ?? null],
    );
    if (!result.rows[0]) throw new Error("ShipperRepository.createUnloadPort: no row returned");
    return result.rows[0];
  }

  async updateUnloadPort(
    id: string,
    dto: UpdateShipperPlantUnloadPortDto,
  ): Promise<ShipperPlantUnloadPortRow | null> {
    const updates: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let idx = 1;
    if (dto.name !== undefined) {
      updates.push(`name = TRIM($${idx++})`);
      params.push(dto.name);
    }
    if (dto.jps_port_id !== undefined) {
      updates.push(`jps_port_id = $${idx++}`);
      params.push(dto.jps_port_id);
    }
    if (params.length === 0) {
      const existing = await this.pool.query<ShipperPlantUnloadPortRow>(
        `SELECT ${UNLOAD_PORT_COLS} FROM shipper_plant_unload_ports WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      return existing.rows[0] ?? null;
    }
    params.push(id);
    const result = await this.pool.query<ShipperPlantUnloadPortRow>(
      `UPDATE shipper_plant_unload_ports SET ${updates.join(", ")}
       WHERE id = $${idx} AND deleted_at IS NULL
       RETURNING ${UNLOAD_PORT_COLS}`,
      params,
    );
    return result.rows[0] ?? null;
  }

  async listAllUnloadPorts(): Promise<
    Array<{
      id: string;
      plant_id: string;
      plant_name: string;
      shipper_id: string;
      shipper_short_name: string;
      name: string;
      jps_port_id: number | null;
    }>
  > {
    const result = await this.pool.query<{
      id: string;
      plant_id: string;
      plant_name: string;
      shipper_id: string;
      shipper_short_name: string;
      name: string;
      jps_port_id: number | null;
    }>(
      `SELECT up.id,
              up.plant_id,
              p.name AS plant_name,
              p.shipper_id,
              s.short_name AS shipper_short_name,
              up.name,
              up.jps_port_id
       FROM shipper_plant_unload_ports up
       JOIN shipper_plants p ON p.id = up.plant_id AND p.deleted_at IS NULL
       JOIN master_shippers s ON s.id = p.shipper_id AND s.deleted_at IS NULL
       WHERE up.deleted_at IS NULL
       ORDER BY LOWER(s.short_name) ASC, LOWER(p.name) ASC, LOWER(up.name) ASC`,
    );
    return result.rows;
  }

  async getUnloadPortListRowById(id: string): Promise<{
    id: string;
    plant_id: string;
    plant_name: string;
    shipper_id: string;
    shipper_short_name: string;
    name: string;
    jps_port_id: number | null;
  } | null> {
    const result = await this.pool.query<{
      id: string;
      plant_id: string;
      plant_name: string;
      shipper_id: string;
      shipper_short_name: string;
      name: string;
      jps_port_id: number | null;
    }>(
      `SELECT up.id,
              up.plant_id,
              p.name AS plant_name,
              p.shipper_id,
              s.short_name AS shipper_short_name,
              up.name,
              up.jps_port_id
       FROM shipper_plant_unload_ports up
       JOIN shipper_plants p ON p.id = up.plant_id AND p.deleted_at IS NULL
       JOIN master_shippers s ON s.id = p.shipper_id AND s.deleted_at IS NULL
       WHERE up.id = $1 AND up.deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async listJpsMappedUnloadPorts(): Promise<
    Array<{
      id: string;
      plant_id: string;
      plant_name: string;
      shipper_id: string;
      shipper_short_name: string;
      name: string;
      jps_port_id: number;
    }>
  > {
    const all = await this.listAllUnloadPorts();
    return all.filter(
      (r): r is typeof r & { jps_port_id: number } =>
        r.jps_port_id != null && Number.isFinite(Number(r.jps_port_id)),
    );
  }

  async softDeleteUnloadPort(id: string): Promise<ShipperPlantUnloadPortRow | null> {
    const result = await this.pool.query<ShipperPlantUnloadPortRow>(
      `UPDATE shipper_plant_unload_ports SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${UNLOAD_PORT_COLS}`,
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
    const updates: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let idx = 1;
    if (dto.name !== undefined) {
      updates.push(`name = TRIM($${idx++})`);
      params.push(dto.name);
    }
    if (dto.jps_port_id !== undefined) {
      updates.push(`jps_port_id = $${idx++}`);
      params.push(dto.jps_port_id);
    }
    if (params.length === 0) {
      const existing = await this.pool.query<ShipperLoadportRow>(
        `SELECT ${LP_COLS} FROM shipper_loadports WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      );
      return existing.rows[0] ?? null;
    }
    params.push(id);
    const result = await this.pool.query<ShipperLoadportRow>(
      `UPDATE shipper_loadports SET ${updates.join(", ")}
       WHERE id = $${idx} AND deleted_at IS NULL
       RETURNING ${LP_COLS}`,
      params,
    );
    return result.rows[0] ?? null;
  }

  /** Distinct EOS load ports that are linked to a JPS port (for import Jetty picker). */
  async listJpsMappedLoadports(): Promise<
    Array<{
      id: string;
      shipper_id: string;
      shipper_short_name: string;
      name: string;
      jps_port_id: number;
    }>
  > {
    const result = await this.pool.query<{
      id: string;
      shipper_id: string;
      shipper_short_name: string;
      name: string;
      jps_port_id: number;
    }>(
      `SELECT lp.id, lp.shipper_id, s.short_name AS shipper_short_name, lp.name, lp.jps_port_id
       FROM shipper_loadports lp
       JOIN master_shippers s ON s.id = lp.shipper_id AND s.deleted_at IS NULL
       WHERE lp.deleted_at IS NULL
         AND lp.jps_port_id IS NOT NULL
       ORDER BY LOWER(lp.name) ASC, LOWER(s.short_name) ASC`,
    );
    return result.rows;
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

  /* ───────── document header ───────── */

  async getDocumentHeaderMeta(id: string): Promise<{
    id: string;
    short_name: string;
    storage_key: string | null;
    file_name: string | null;
    mime_type: string | null;
  } | null> {
    const result = await this.pool.query<{
      id: string;
      short_name: string;
      storage_key: string | null;
      file_name: string | null;
      mime_type: string | null;
    }>(
      `SELECT id, short_name,
              document_header_storage_key AS storage_key,
              document_header_file_name AS file_name,
              document_header_mime_type AS mime_type
       FROM master_shippers
       WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async setDocumentHeader(
    id: string,
    storageKey: string,
    fileName: string,
    mimeType: string | null,
  ): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `UPDATE master_shippers
       SET document_header_storage_key = $2,
           document_header_file_name = $3,
           document_header_mime_type = $4,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${SHIPPER_COLS}`,
      [id, storageKey, fileName, mimeType],
    );
    return result.rows[0] ?? null;
  }

  async clearDocumentHeader(id: string): Promise<ShipperRow | null> {
    const result = await this.pool.query<ShipperRow>(
      `UPDATE master_shippers
       SET document_header_storage_key = NULL,
           document_header_file_name = NULL,
           document_header_mime_type = NULL,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING ${SHIPPER_COLS}`,
      [id],
    );
    return result.rows[0] ?? null;
  }
}
