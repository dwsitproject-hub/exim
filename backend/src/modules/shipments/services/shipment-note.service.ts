/**
 * Shipment notes (comments) — business logic.
 */

import { getPool } from "../../../db/index.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import { UserRepository } from "../../auth/repositories/user.repository.js";
import { NotificationRepository } from "../../notifications/repositories/notification.repository.js";
import { parseMentionUserIdsFromNote } from "../../../shared/note-mentions.js";
import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { ShipmentNoteRepository, type ShipmentNoteRow } from "../repositories/shipment-note.repository.js";

export interface ShipmentNoteDto {
  id: string;
  shipment_id: string;
  note: string;
  created_by_user_id: string | null;
  created_by_name: string;
  created_at: string;
}

function toDto(row: ShipmentNoteRow): ShipmentNoteDto {
  return {
    id: row.id,
    shipment_id: row.shipment_id,
    note: row.note,
    created_by_user_id: row.created_by_user_id,
    created_by_name: row.created_by_name,
    created_at: row.created_at.toISOString(),
  };
}

export class ShipmentNoteService {
  private readonly userRepo = new UserRepository();
  private readonly notificationRepo = new NotificationRepository();

  constructor(
    private readonly shipmentRepo: ShipmentRepository,
    private readonly noteRepo: ShipmentNoteRepository
  ) {}

  async list(shipmentId: string): Promise<ShipmentNoteDto[]> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    const rows = await this.noteRepo.listByShipmentId(shipmentId);
    return rows.map(toDto);
  }

  async create(
    shipmentId: string,
    note: string,
    userId: string | null,
    displayName: string
  ): Promise<ShipmentNoteDto> {
    const shipment = await this.shipmentRepo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);

    const parsedIds = parseMentionUserIdsFromNote(note);
    const validIds = await this.userRepo.filterExistingActiveUserIds(parsedIds);
    let mentionUserIds = parsedIds.filter((id) => validIds.has(id));
    mentionUserIds = [...new Set(mentionUserIds)];
    if (userId) {
      mentionUserIds = mentionUserIds.filter((id) => id !== userId);
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const row = await this.noteRepo.createWithClient(client, shipmentId, note, userId, displayName);
      if (mentionUserIds.length > 0) {
        await this.noteRepo.insertMentionsWithClient(client, row.id, mentionUserIds);
        const message = `${displayName} mentioned you in a shipment note.`;
        await this.notificationRepo.insertMentionNotifications(
          client,
          mentionUserIds.map((uid) => ({
            userId: uid,
            noteId: row.id,
            shipmentId,
            message,
          }))
        );
      }
      await client.query("COMMIT");
      return toDto(row);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
