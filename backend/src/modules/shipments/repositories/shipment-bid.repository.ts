/**
 * Shipment bids repository: CRUD for bidding transporter participants.
 */

import type { Pool } from "pg";
import { getPool } from "../../../db/index.js";
import type {
  ShipmentBidRow,
  CreateShipmentBidDto,
  UpdateShipmentBidDto,
} from "../dto/index.js";
import { DEFAULT_FREIGHT_CHARGE_CURRENCY } from "../../../shared/freight-currency.js";

const COLUMNS =
  "id, shipment_id, forwarder_name, service_amount, service_amount_currency, duration, quotation_expires_at, origin_port, destination_port, ship_via, quotation_file_name, quotation_storage_key, created_at, updated_at";

export class ShipmentBidRepository {
  private get pool(): Pool {
    return getPool();
  }

  async findByShipmentId(shipmentId: string): Promise<ShipmentBidRow[]> {
    const result = await this.pool.query<ShipmentBidRow>(
      `SELECT ${COLUMNS} FROM shipment_bids WHERE shipment_id = $1 ORDER BY created_at ASC`,
      [shipmentId]
    );
    return result.rows;
  }

  /**
   * Recent forwarders from historical bids (latest bid per forwarder).
   * Used for quick re-selection in bidding UX.
   *
   * Only forwarders already on `forShipmentId` (shipment liner or a bid on that shipment), with a historical bid
   * on some shipment whose `origin_port_country` matches (case-insensitive), and quotation not expired:
   * `quotation_expires_at` date >= today, or legacy `duration` (first integer = days) from `updated_at` still in the future;
   * rows with neither expiry still count as valid (matches frontend). Empty `originPortCountry` or no used forwarders → no rows.
   */
  async findRecentForwarders(
    limit: number,
    originPortCountry: string | null | undefined,
    forShipmentId: string
  ): Promise<
    Array<{
      forwarder_name: string;
      shipment_id: string;
      duration: string | null;
      quotation_expires_at: Date | null;
      service_amount: number | null;
      service_amount_currency: string;
      origin_port: string | null;
      destination_port: string | null;
      origin_country: string | null;
      destination_country: string | null;
      ship_via: string | null;
      updated_at: Date;
    }>
  > {
    const safeLimit = Math.max(1, Math.min(200, limit));
    const country = (originPortCountry ?? "").trim();
    if (!country) return [];

    const params: unknown[] = [safeLimit, country, forShipmentId];

    const result = await this.pool.query<{
      forwarder_name: string;
      shipment_id: string;
      duration: string | null;
      quotation_expires_at: Date | null;
      service_amount: number | null;
      service_amount_currency: string;
      origin_port: string | null;
      destination_port: string | null;
      origin_country: string | null;
      destination_country: string | null;
      ship_via: string | null;
      updated_at: Date;
    }>(
      `WITH used_forwarders AS (
         SELECT DISTINCT LOWER(TRIM(v)) AS k
         FROM (
           SELECT forwarder_name AS v FROM shipments
           WHERE id = $3::uuid AND deleted_at IS NULL AND TRIM(COALESCE(forwarder_name, '')) <> ''
           UNION ALL
           SELECT forwarder_name AS v FROM shipment_bids
           WHERE shipment_id = $3::uuid AND TRIM(COALESCE(forwarder_name, '')) <> ''
         ) x
       )
       SELECT *
       FROM (
         SELECT DISTINCT ON (LOWER(TRIM(b.forwarder_name)))
           TRIM(b.forwarder_name) AS forwarder_name,
           b.shipment_id,
           b.duration,
           b.quotation_expires_at,
           b.service_amount,
           b.service_amount_currency,
           b.origin_port,
           b.destination_port,
           s.origin_port_country AS origin_country,
           s.destination_port_country AS destination_country,
           b.ship_via,
           b.updated_at
         FROM shipment_bids b
         INNER JOIN shipments s ON s.id = b.shipment_id AND s.deleted_at IS NULL
         INNER JOIN used_forwarders u ON LOWER(TRIM(b.forwarder_name)) = u.k
         WHERE TRIM(COALESCE(b.forwarder_name, '')) <> ''
           AND LOWER(TRIM(COALESCE(s.origin_port_country, ''))) = LOWER($2::text)
           AND (
             CASE
               WHEN b.quotation_expires_at IS NOT NULL THEN b.quotation_expires_at::date >= CURRENT_DATE
               WHEN b.duration ~ '[0-9]+' THEN b.updated_at + ((SUBSTRING(b.duration FROM '[0-9]+'))::int * INTERVAL '1 day') >= NOW()
               ELSE TRUE
             END
           )
         ORDER BY LOWER(TRIM(b.forwarder_name)), b.updated_at DESC
       ) latest
       ORDER BY updated_at DESC
       LIMIT $1`,
      params
    );
    return result.rows;
  }

  async findById(id: string): Promise<ShipmentBidRow | null> {
    const result = await this.pool.query<ShipmentBidRow>(
      `SELECT ${COLUMNS} FROM shipment_bids WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  async create(shipmentId: string, dto: CreateShipmentBidDto): Promise<ShipmentBidRow> {
    const result = await this.pool.query<ShipmentBidRow>(
      `INSERT INTO shipment_bids (shipment_id, forwarder_name, service_amount, service_amount_currency, duration, quotation_expires_at, origin_port, destination_port, ship_via, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING ${COLUMNS}`,
      [
        shipmentId,
        dto.forwarder_name.trim(),
        dto.service_amount ?? null,
        dto.service_amount_currency ?? DEFAULT_FREIGHT_CHARGE_CURRENCY,
        dto.duration?.trim() ?? null,
        dto.quotation_expires_at ?? null,
        dto.origin_port?.trim() ?? null,
        dto.destination_port?.trim() ?? null,
        dto.ship_via?.trim() ?? null,
      ]
    );
    return result.rows[0];
  }

  async update(id: string, dto: UpdateShipmentBidDto): Promise<ShipmentBidRow | null> {
    const updates: string[] = ["updated_at = NOW()"];
    const params: unknown[] = [];
    let idx = 1;
    if (dto.forwarder_name !== undefined) {
      updates.push(`forwarder_name = $${idx++}`);
      params.push(dto.forwarder_name.trim());
    }
    if (dto.service_amount !== undefined) {
      updates.push(`service_amount = $${idx++}`);
      params.push(dto.service_amount);
    }
    if (dto.service_amount_currency !== undefined) {
      updates.push(`service_amount_currency = $${idx++}`);
      params.push(dto.service_amount_currency);
    }
    if (dto.duration !== undefined) {
      updates.push(`duration = $${idx++}`);
      params.push(dto.duration.trim() || null);
    }
    if (dto.quotation_expires_at !== undefined) {
      updates.push(`quotation_expires_at = $${idx++}`);
      params.push(dto.quotation_expires_at);
    }
    if (dto.origin_port !== undefined) {
      updates.push(`origin_port = $${idx++}`);
      params.push(dto.origin_port.trim() || null);
    }
    if (dto.destination_port !== undefined) {
      updates.push(`destination_port = $${idx++}`);
      params.push(dto.destination_port.trim() || null);
    }
    if (dto.ship_via !== undefined) {
      updates.push(`ship_via = $${idx++}`);
      params.push(dto.ship_via.trim() || null);
    }
    if (dto.quotation_file_name !== undefined) {
      updates.push(`quotation_file_name = $${idx++}`);
      params.push(dto.quotation_file_name || null);
    }
    if (dto.quotation_storage_key !== undefined) {
      updates.push(`quotation_storage_key = $${idx++}`);
      params.push(dto.quotation_storage_key || null);
    }
    if (params.length === 1) return this.findById(id);
    params.push(id);
    const result = await this.pool.query<ShipmentBidRow>(
      `UPDATE shipment_bids SET ${updates.join(", ")} WHERE id = $${idx} RETURNING ${COLUMNS}`,
      params
    );
    return result.rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM shipment_bids WHERE id = $1 RETURNING id",
      [id]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}
