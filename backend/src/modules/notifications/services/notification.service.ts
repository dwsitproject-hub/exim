/**
 * In-app notifications — business logic.
 */

import { NotificationRepository, type NotificationRow } from "../repositories/notification.repository.js";

export interface NotificationDto {
  id: string;
  type: string;
  reference_id: string;
  shipment_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
}

function toDto(row: NotificationRow): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    reference_id: row.reference_id,
    shipment_id: row.shipment_id,
    message: row.message,
    read_at: row.read_at ? row.read_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
  };
}

export class NotificationService {
  constructor(private readonly repo: NotificationRepository) {}

  async listForUser(
    userId: string,
    options: { limit: number; unreadOnly: boolean }
  ): Promise<{ items: NotificationDto[]; unread_count: number }> {
    const [items, unread_count] = await Promise.all([
      this.repo.listForUser(userId, options),
      this.repo.countUnread(userId),
    ]);
    return { items: items.map(toDto), unread_count };
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    return this.repo.markRead(userId, notificationId);
  }

  async markAllRead(userId: string): Promise<number> {
    return this.repo.markAllRead(userId);
  }
}
