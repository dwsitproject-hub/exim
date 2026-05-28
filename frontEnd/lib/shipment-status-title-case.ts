/**
 * Strict Title Case for shipment operational statuses (underscore-separated enums).
 * Example: INITIATE_SHIPPING_DOCUMENT → "Initiate Shipping Document"
 */
export function formatShipmentStatusTitleCase(status: string): string {
  return status
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
