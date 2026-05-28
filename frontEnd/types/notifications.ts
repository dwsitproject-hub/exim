/**
 * GET/PATCH /notifications — in-app notifications.
 */

export interface AppNotification {
  id: string;
  type: string;
  reference_id: string;
  shipment_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
}
