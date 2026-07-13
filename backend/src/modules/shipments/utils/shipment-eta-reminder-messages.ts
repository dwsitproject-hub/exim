/**
 * Copy and date helpers for import shipment ETA reminder notifications.
 */

export type EtaReminderKind = "h1" | "h2" | "h3";

export const ETA_REMINDER_TIMEZONE = "Asia/Jakarta";

/** Format YYYY-MM-DD for notification body (e.g. "27 June 2026"). */
export function formatEtaDisplayDate(etaDateYmd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(etaDateYmd.trim());
  if (!m) return etaDateYmd;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (Number.isNaN(dt.getTime())) return etaDateYmd;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export function formatPoNumbersForReminder(poNumbers: string | null | undefined): string {
  const raw = (poNumbers ?? "").trim();
  if (!raw) return "—";
  return raw;
}

export function buildEtaReminderMessage(
  shipmentNo: string,
  poNumbers: string | null | undefined,
  etaDateYmd: string,
  kind: EtaReminderKind
): string {
  const etaLabel = formatEtaDisplayDate(etaDateYmd);
  const no = shipmentNo.trim() || "—";
  const po = formatPoNumbersForReminder(poNumbers);
  const prefix = `Import ${no} (PO ${po})`;

  if (kind === "h3") {
    return `${prefix}: ETA in 3 days (${etaLabel}). Please review shipment readiness.`;
  }
  if (kind === "h2") {
    return `${prefix}: ETA in 2 days (${etaLabel}). Please review shipment readiness.`;
  }
  return `${prefix}: ETA tomorrow (${etaLabel}). Please confirm arrival preparation.`;
}

export function etaReminderNotificationType(
  kind: EtaReminderKind
): "shipment_eta_h3" | "shipment_eta_h2" | "shipment_eta_h1" {
  if (kind === "h3") return "shipment_eta_h3";
  if (kind === "h2") return "shipment_eta_h2";
  return "shipment_eta_h1";
}

export function etaReminderDaysAhead(kind: EtaReminderKind): number {
  if (kind === "h3") return 3;
  if (kind === "h2") return 2;
  return 1;
}
