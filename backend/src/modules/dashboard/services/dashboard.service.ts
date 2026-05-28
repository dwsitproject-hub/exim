import { config } from "../../../config/index.js";
import type {
  ClassificationBucketKey,
  DeliveredClassificationAggQuery,
  DeliveredManagementQuery,
  DeliveredManagementRow,
  DeliveredPtPlantAggQuery,
  DeliveredPtPlantAggRow,
  ProcurementReportLineRow,
} from "../repositories/dashboard.repository.js";
import { DashboardRepository } from "../repositories/dashboard.repository.js";
import type {
  ShipmentAnalyticsLineAggRow,
  ShipmentAnalyticsLinesQuery,
  ShipmentAnalyticsQuery,
  ShipmentAnalyticsSummary,
} from "../repositories/shipment-analytics.repository.js";
import { ShipmentAnalyticsRepository } from "../repositories/shipment-analytics.repository.js";

export interface DeliveredClassificationAggRow {
  classification_key: ClassificationBucketKey;
  label: string;
  unit: string;
  total_amount_idr: number;
  total_qty: number;
}

const CLASSIFICATION_META: Record<ClassificationBucketKey, { label: string; unit: string }> = {
  chemical: { label: "Chemical", unit: "MT" },
  packaging: { label: "Packaging", unit: "Sets" },
  sparepart: { label: "Spare Parts", unit: "PCS" },
};

const CLASSIFICATION_ORDER: ClassificationBucketKey[] = ["chemical", "packaging", "sparepart"];

const MONTH_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

export interface ProcurementReportMetrics {
  amount_usd: number;
  qty: number;
}

export interface ProcurementReportRow {
  pt: string;
  plant: string;
  item: string;
  display_unit: string | null;
  ytd: ProcurementReportMetrics;
  month: ProcurementReportMetrics;
  prev_month: ProcurementReportMetrics;
}

export interface ProcurementReportSection {
  id: ClassificationBucketKey;
  title: string;
  section_unit_hint: string;
  rows: ProcurementReportRow[];
  totals: {
    ytd: ProcurementReportMetrics;
    month: ProcurementReportMetrics;
    prev_month: ProcurementReportMetrics;
  };
}

export interface ProcurementPlantReportPayload {
  year: number;
  month: number;
  month_label: string;
  prev_month_label: string;
  ytd_label: string;
  idr_per_usd_used: number;
  sections: ProcurementReportSection[];
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function lastDayOfMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Inclusive SQL range for lines needed: YTD through selected month + previous calendar month. */
function procurementLineQueryRange(year: number, month: number): { start: string; end: string } {
  if (month === 1) {
    return {
      start: isoDate(year - 1, 12, 1),
      end: isoDate(year, 1, lastDayOfMonth(year, 1)),
    };
  }
  return {
    start: isoDate(year, 1, 1),
    end: isoDate(year, month, lastDayOfMonth(year, month)),
  };
}

function prevCalendarMonth(year: number, month: number): { y: number; m: number } {
  if (month <= 1) return { y: year - 1, m: 12 };
  return { y: year, m: month - 1 };
}

/** Normalize DB `date` / ISO string / Date to YYYY-MM-DD (UTC calendar day, matching SQL AT TIME ZONE 'UTC'). */
function parseDeliveryDay(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return isoDate(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  const s = String(raw).trim();
  const t = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return t;
}

/** US$ for display: line value in IDR (qty × unit_price × mapping currency_rate at transaction) ÷ reporting rate. */
function lineAmountUsdFromIdr(amountIdr: number, idrPerUsd: number): number {
  return amountIdr / idrPerUsd;
}

type PeriodKey = "ytd" | "month" | "prev_month";

function periodHits(
  day: string,
  year: number,
  month: number,
  prevY: number,
  prevM: number
): Set<PeriodKey> {
  const hit = new Set<PeriodKey>();
  if (day >= isoDate(year, 1, 1) && day <= isoDate(year, month, lastDayOfMonth(year, month))) {
    hit.add("ytd");
  }
  if (day.startsWith(`${year}-${pad2(month)}-`)) {
    hit.add("month");
  }
  if (day >= isoDate(prevY, prevM, 1) && day <= isoDate(prevY, prevM, lastDayOfMonth(prevY, prevM))) {
    hit.add("prev_month");
  }
  return hit;
}

interface MutableRow {
  pt: string;
  plant: string;
  item: string;
  display_unit: string | null;
  ytd: ProcurementReportMetrics;
  month: ProcurementReportMetrics;
  prev_month: ProcurementReportMetrics;
}

function emptyMetrics(): ProcurementReportMetrics {
  return { amount_usd: 0, qty: 0 };
}

function addMetrics(target: ProcurementReportMetrics, amount: number, qty: number): void {
  target.amount_usd += amount;
  target.qty += qty;
}

/**
 * Group recurring Chemical / Packaging lines that differ only by spacing or casing (e.g. "Sodium Methylate" → one row).
 */
function normalizeRecurringItemLabel(raw: string | null | undefined): string {
  const collapsed = (raw ?? "").trim().replace(/\s+/g, " ");
  if (collapsed === "") return "—";
  return collapsed.toLocaleUpperCase("en-US");
}

const SECTION_META: Record<
  ClassificationBucketKey,
  { title: string; section_unit_hint: string }
> = {
  chemical: { title: "CHEMICAL", section_unit_hint: "MT" },
  packaging: { title: "PACKAGING", section_unit_hint: "PCE / SETS" },
  sparepart: { title: "SPAREPART", section_unit_hint: "PCS" },
};

export class DashboardService {
  private readonly analyticsRepo = new ShipmentAnalyticsRepository();

  constructor(private readonly repo: DashboardRepository) {}

  async getDeliveredManagementSummary(query: DeliveredManagementQuery): Promise<DeliveredManagementRow[]> {
    return this.repo.getDeliveredManagementSummary(query);
  }

  async getDeliveredByPtPlantAgg(query: DeliveredPtPlantAggQuery): Promise<DeliveredPtPlantAggRow[]> {
    return this.repo.getDeliveredByPtPlantAgg(query);
  }

  async getDeliveredByClassificationAgg(query: DeliveredClassificationAggQuery): Promise<DeliveredClassificationAggRow[]> {
    const raw = await this.repo.getDeliveredByClassificationAggRaw(query);
    const map = new Map(raw.map((r) => [r.bucket, r]));
    return CLASSIFICATION_ORDER.map((key) => {
      const r = map.get(key);
      const meta = CLASSIFICATION_META[key];
      return {
        classification_key: key,
        label: meta.label,
        unit: meta.unit,
        total_amount_idr: r != null ? parseFloat(r.total_amount_idr) : 0,
        total_qty: r != null ? parseFloat(r.total_qty) : 0,
      };
    });
  }

  /**
   * PT × plant × item matrix: YTD (through selected month), selected month, previous month — US$ from IDR line value.
   * Spare parts rolled up per PT + plant.
   */
  async getProcurementPlantReport(year: number, month: number): Promise<ProcurementPlantReportPayload> {
    const idrPerUsd = config.dashboard.idrPerUsd;
    const { start, end } = procurementLineQueryRange(year, month);
    const lines = await this.repo.getProcurementReportLines(start, end);
    const { y: prevY, m: prevM } = prevCalendarMonth(year, month);

    const rowMap = new Map<string, MutableRow>();

    for (const line of lines) {
      const day = parseDeliveryDay(line.delivered_on);
      if (day == null) continue;
      const periods = periodHits(day, year, month, prevY, prevM);
      if (periods.size === 0) continue;

      const usd = lineAmountUsdFromIdr(line.amount_idr, idrPerUsd);
      const qty = line.qty;
      const pt = line.pt ?? "—";
      const plant = line.plant ?? "—";

      let rowKey: string;
      let item: string;
      let displayUnit: string | null;

      if (line.bucket === "sparepart") {
        rowKey = `sparepart|${pt}|${plant}|__rollup__`;
        item = "Spare parts";
        displayUnit = "PCS";
      } else {
        item = normalizeRecurringItemLabel(line.item_description);
        rowKey = `${line.bucket}|${pt}|${plant}|${item}`;
        displayUnit = line.bucket === "chemical" ? "MT" : line.line_unit ?? "PCE";
      }

      let row = rowMap.get(rowKey);
      if (row == null) {
        row = {
          pt,
          plant,
          item,
          display_unit: displayUnit,
          ytd: emptyMetrics(),
          month: emptyMetrics(),
          prev_month: emptyMetrics(),
        };
        rowMap.set(rowKey, row);
      } else if (line.bucket !== "sparepart" && row.display_unit == null && displayUnit != null) {
        row.display_unit = displayUnit;
      }

      if (periods.has("ytd")) addMetrics(row.ytd, usd, qty);
      if (periods.has("month")) addMetrics(row.month, usd, qty);
      if (periods.has("prev_month")) addMetrics(row.prev_month, usd, qty);
    }

    const sections: ProcurementReportSection[] = CLASSIFICATION_ORDER.map((sectionId) => {
      const meta = SECTION_META[sectionId];
      const rowsForSection = [...rowMap.entries()]
        .filter(([k]) => k.startsWith(`${sectionId}|`))
        .map(([, r]) => r)
        .sort((a, b) => {
          const ptc = a.pt.localeCompare(b.pt, undefined, { sensitivity: "base" });
          if (ptc !== 0) return ptc;
          const plc = a.plant.localeCompare(b.plant, undefined, { sensitivity: "base" });
          if (plc !== 0) return plc;
          return a.item.localeCompare(b.item, undefined, { sensitivity: "base" });
        })
        .map(
          (r): ProcurementReportRow => ({
            pt: r.pt,
            plant: r.plant,
            item: r.item,
            display_unit: r.display_unit,
            ytd: { ...r.ytd },
            month: { ...r.month },
            prev_month: { ...r.prev_month },
          })
        );

      const totals = {
        ytd: emptyMetrics(),
        month: emptyMetrics(),
        prev_month: emptyMetrics(),
      };
      for (const r of rowsForSection) {
        addMetrics(totals.ytd, r.ytd.amount_usd, r.ytd.qty);
        addMetrics(totals.month, r.month.amount_usd, r.month.qty);
        addMetrics(totals.prev_month, r.prev_month.amount_usd, r.prev_month.qty);
      }

      return {
        id: sectionId,
        title: meta.title,
        section_unit_hint: meta.section_unit_hint,
        rows: rowsForSection,
        totals,
      };
    });

    const mi = month - 1;
    const pmi = prevM - 1;

    return {
      year,
      month,
      month_label: MONTH_SHORT[mi] ?? String(month),
      prev_month_label: MONTH_SHORT[pmi] ?? String(prevM),
      ytd_label: `YTD ${MONTH_SHORT[mi] ?? ""} ${year}`.trim(),
      idr_per_usd_used: idrPerUsd,
      sections,
    };
  }

  async getShipmentAnalytics(query: ShipmentAnalyticsQuery): Promise<ShipmentAnalyticsSummary> {
    return this.analyticsRepo.getSummary(query);
  }

  async getShipmentAnalyticsLines(query: ShipmentAnalyticsLinesQuery): Promise<ShipmentAnalyticsLineAggRow[]> {
    return this.analyticsRepo.getLineAggregation(query);
  }
}
