/**
 * Shipment service: business logic. Create, monitor lifecycle, summary; couple/decouple PO.
 */

import { createHash } from "node:crypto";
import { ShipmentRepository } from "../repositories/shipment.repository.js";
import { ShipmentPoMappingRepository } from "../repositories/shipment-po-mapping.repository.js";
import { ShipmentPoLineReceivedRepository } from "../repositories/shipment-po-line-received.repository.js";
import { ShipmentStatusHistoryRepository } from "../repositories/shipment-status-history.repository.js";
import { PoIntakeRepository } from "../../po-intake/repositories/po-intake.repository.js";
import type { PoIntakeRow } from "../../po-intake/dto/index.js";

function normalizeGroupField(v: string | null | undefined): string {
  return (v ?? "").trim().toUpperCase();
}

/** YYYY-MM-DD from DB Date or ISO-ish string; null if missing/invalid. */
function shipmentDateToYmd(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  const y = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(y) ? y : null;
}

/** True when PO currency is IDR (sum PO amounts as-is; no FX). */
function isPoCurrencyIdr(currency: string | null | undefined): boolean {
  const c = normalizeGroupField(currency);
  return c === "IDR" || c === "RP";
}
import { AppError } from "../../../middlewares/errorHandler.js";
import type {
  CreateShipmentDto,
  ShipmentCsvImportErrorRow,
  ShipmentCsvImportResult,
  UpdateShipmentDto,
  ListShipmentsQuery,
  ShipmentListFilterOptions,
  ShipmentRow,
  ShipmentListItem,
  ShipmentListLinkedPo,
  ShipmentDetail,
  CreateShipmentResponse,
  LinkedPoSummary,
} from "../dto/index.js";
import { ShipmentUpdateLogRepository } from "../repositories/shipment-update-log.repository.js";
import { syncPoIntakeStatus } from "../../po-intake/services/po-intake-status-sync.service.js";
import { normalizeProductClassificationForApi } from "../../../shared/product-classification.js";
import { isPibTypeBc23 } from "../../../shared/pib-type.js";
import { isAtOrPastCustomsClearance } from "../utils/shipment-status-requirements.js";
import { buildShipmentCsvImportSummary } from "../../../shared/csv-import-summary.js";
import {
  SHIPMENT_CSV_ALIASES,
  SHIPMENT_CSV_CANONICAL_FIELDS,
  SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL,
  SHIPMENT_CSV_TEMPLATE_HEADER_ORDER,
} from "../../../shared/csv-import-aliases.js";
import {
  csvCell,
  detectCsvDelimiter,
  isUuidString,
  parseCsvLine,
  parseInternationalNumber,
  resolveCsvColumnIndices,
  splitCsvTextToDataLines,
  stripBom,
} from "../../../shared/csv-import-utils.js";
import { SHIPMENT_CSV_TEMPLATE_HINT_LINES } from "../../../shared/shipment-csv-template-hints.js";
import {
  DEFAULT_FREIGHT_CHARGE_CURRENCY,
  normalizeFreightChargeCurrency,
} from "../../../shared/freight-currency.js";

const poIntakeRepo = new PoIntakeRepository();

function parseOptionalNumber(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function isValidDateString(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  const dm = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) {
    const d = parseInt(dm[1]!, 10);
    const mo = parseInt(dm[2]!, 10) - 1;
    const y = parseInt(dm[3]!, 10);
    const dt = new Date(y, mo, d);
    return dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d;
  }
  const d = new Date(t);
  return !isNaN(d.getTime());
}

/** Normalise d/m/y to yyyy-mm-dd for DB-safe date fields. */
function normalizeCsvDateToApi(s: string): string {
  const t = s.trim();
  const dm = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dm) {
    const d = parseInt(dm[1]!, 10);
    const mo = parseInt(dm[2]!, 10);
    const y = parseInt(dm[3]!, 10);
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return t;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return t;
}

function buildRemarksWithTotalPo(base: string | undefined, totalPoRaw: string): string | undefined {
  const baseTrim = (base ?? "").trim();
  const t = totalPoRaw.trim();
  if (!t) return baseTrim || undefined;
  const suffix = `CSV total_po_amount: ${t}`;
  if (!baseTrim) return suffix;
  return `${baseTrim} | ${suffix}`;
}

/** Groups CSV rows into one new shipment when Shipment number is omitted: same hash ⇒ same shipment. */
function stableShipmentFieldsSignature(dto: UpdateShipmentDto): string {
  const keys = (Object.keys(dto) as (keyof UpdateShipmentDto)[])
    .filter((k) => {
      const v = dto[k];
      if (v === undefined || v === null) return false;
      if (typeof v === "string" && v.trim() === "") return false;
      return true;
    })
    .sort();
  const obj: Record<string, unknown> = {};
  for (const k of keys) obj[String(k)] = dto[k];
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

/** CSV import must not set `closed_at` (Delivered at) before coupling POs — `couplePo` rejects closed shipments. */
function withoutClosedAtForCsvCoupling(sf: UpdateShipmentDto): UpdateShipmentDto {
  const { closed_at: _omit, ...rest } = sf;
  return rest;
}

function combinedRowToCreateDto(sf: UpdateShipmentDto): CreateShipmentDto {
  return {
    vendor_name: sf.vendor_name,
    forwarder_name: sf.forwarder_name,
    incoterm: sf.incoterm,
    shipment_method: sf.shipment_method,
    origin_port_name: sf.origin_port_name,
    origin_port_country: sf.origin_port_country,
    destination_port_name: sf.destination_port_name,
    destination_port_country: sf.destination_port_country,
    etd: sf.etd,
    eta: sf.eta,
    remarks: sf.remarks,
    pib_type: sf.pib_type,
    no_request_pib: sf.no_request_pib,
    ppjk_mkl: sf.ppjk_mkl,
    nopen: sf.nopen,
    nopen_date: sf.nopen_date,
    bl_awb: sf.bl_awb,
    insurance_no: sf.insurance_no,
    coo: sf.coo,
    incoterm_amount: sf.incoterm_amount,
    incoterm_currency: sf.incoterm_currency,
    cbm: sf.cbm,
    product_classification: sf.product_classification ?? undefined,
  };
}

/** When CSV omits supplier / incoterm, use linked PO intake (same as PO screen). */
function applyPoIntakeDefaultsToShipmentDto(dto: UpdateShipmentDto, intake: PoIntakeRow): UpdateShipmentDto {
  const out: UpdateShipmentDto = { ...dto };
  const blank = (s: string | undefined) => s == null || String(s).trim() === "";
  if (blank(out.vendor_name)) {
    out.vendor_name = intake.supplier_name?.trim() || undefined;
  }
  if (blank(out.incoterm)) {
    out.incoterm = intake.incoterm_location?.trim() || undefined;
  }
  return out;
}

function collectUpdateShipmentFieldKeys(dto: UpdateShipmentDto): string[] {
  return (Object.keys(dto) as (keyof UpdateShipmentDto)[]).filter((k) => dto[k] !== undefined) as string[];
}

function normalizeFieldValue(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return String(value);
}

function collectUpdateFieldChanges(
  before: ShipmentRow,
  after: ShipmentRow,
  keys: string[]
): Array<{ field: string; before: string | null; after: string | null }> {
  const out: Array<{ field: string; before: string | null; after: string | null }> = [];
  const beforeRecord = before as unknown as Record<string, unknown>;
  const afterRecord = after as unknown as Record<string, unknown>;
  for (const key of keys) {
    const beforeValue = normalizeFieldValue(beforeRecord[key]);
    const afterValue = normalizeFieldValue(afterRecord[key]);
    if (beforeValue === afterValue) continue;
    out.push({ field: key, before: beforeValue, after: afterValue });
  }
  return out;
}

function toListItem(row: ShipmentRow, linkedPos: ShipmentListLinkedPo[]): ShipmentListItem {
  const first = linkedPos[0];
  const pic = linkedPos.find((p) => p.taken_by_name && p.taken_by_name.trim() !== "")?.taken_by_name ?? null;
  return {
    id: row.id,
    shipment_number: row.shipment_no,
    supplier_name: row.vendor_name,
    vendor_name: row.vendor_name,
    incoterm: row.incoterm ?? null,
    pib_type: row.pib_type ?? null,
    shipment_method: row.shipment_method ?? null,
    product_classification: normalizeProductClassificationForApi(row.product_classification),
    ship_by: row.ship_by ?? null,
    forwarder_name: row.forwarder_name,
    origin_port_name: row.origin_port_name,
    destination_port_name: row.destination_port_name,
    current_status: row.current_status,
    etd: row.etd ? row.etd.toISOString().slice(0, 10) : null,
    eta: row.eta ? row.eta.toISOString().slice(0, 10) : null,
    linked_po_count: linkedPos.length,
    pic_name: pic,
    display_pt: first?.pt ?? null,
    display_plant: first?.plant ?? null,
    closed_at: row.closed_at ? row.closed_at.toISOString() : null,
    linked_pos: linkedPos,
  };
}

function toLinkedSummary(
  row: {
    intake_id: string;
    po_number: string;
    pt: string | null;
    plant: string | null;
    supplier_name: string;
    incoterm_location: string | null;
    currency: string | null;
    invoice_no: string | null;
    currency_rate: number | null;
    taken_by_name: string | null;
    coupled_at: Date;
    coupled_by: string;
  },
  lineReceived: {
    item_id: string;
    received_qty: number;
    item_description?: string | null;
    bm_percentage?: number | null;
    ppn_percentage?: number | null;
    pph_percentage?: number | null;
  }[] = []
): LinkedPoSummary {
  return {
    intake_id: row.intake_id,
    po_number: row.po_number,
    pt: row.pt,
    plant: row.plant,
    supplier_name: row.supplier_name,
    incoterm_location: row.incoterm_location,
    currency: row.currency ?? null,
    invoice_no: row.invoice_no ?? null,
    currency_rate: row.currency_rate ?? null,
    coupled_at: row.coupled_at.toISOString(),
    coupled_by: row.coupled_by,
    taken_by_name: row.taken_by_name ?? null,
    line_received: lineReceived.map((l) => ({
      item_id: l.item_id,
      received_qty: l.received_qty,
      item_description: l.item_description ?? null,
      bm_percentage: l.bm_percentage ?? null,
      ppn_percentage: l.ppn_percentage ?? null,
      pph_percentage: l.pph_percentage ?? null,
    })),
  };
}

function toDetail(
  row: ShipmentRow,
  linkedPos: LinkedPoSummary[],
  totalItemsAmount: number,
  duty: { bm: number; ppn: number; pph: number; pdri: number }
): ShipmentDetail {
  const { bm: bmAmount, ppn, pph, pdri } = duty;
  const pic = linkedPos.find((p) => p.taken_by_name && p.taken_by_name.trim() !== "")?.taken_by_name ?? null;

  return {
    id: row.id,
    shipment_number: row.shipment_no,
    vendor_code: row.vendor_code,
    vendor_name: row.vendor_name,
    forwarder_code: row.forwarder_code,
    forwarder_name: row.forwarder_name,
    warehouse_code: row.warehouse_code,
    warehouse_name: row.warehouse_name,
    incoterm: row.incoterm,
    shipment_method: row.shipment_method,
    origin_port_code: row.origin_port_code,
    origin_port_name: row.origin_port_name,
    origin_port_country: row.origin_port_country,
    destination_port_code: row.destination_port_code,
    destination_port_name: row.destination_port_name,
    destination_port_country: row.destination_port_country,
    etd: row.etd ? row.etd.toISOString() : null,
    eta: row.eta ? row.eta.toISOString().slice(0, 10) : null,
    atd: row.atd ? row.atd.toISOString() : null,
    ata: row.ata ? row.ata.toISOString() : null,
    depo: row.depo,
    depo_location: row.depo_location ?? null,
    current_status: row.current_status,
    closed_at: row.closed_at ? row.closed_at.toISOString() : null,
    close_reason: row.close_reason,
    remarks: row.remarks,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    pic_name: pic,
    pib_type: row.pib_type ?? null,
    no_request_pib: row.no_request_pib ?? null,
    ppjk_mkl: row.ppjk_mkl ?? null,
    nopen: row.nopen ?? null,
    nopen_date: row.nopen_date ? row.nopen_date.toISOString().slice(0, 10) : null,
    ship_by: row.ship_by ?? null,
    bl_awb: row.bl_awb ?? null,
    insurance_no: row.insurance_no ?? null,
    coo: row.coo ?? null,
    incoterm_amount: row.incoterm_amount ?? null,
    incoterm_currency: row.incoterm_currency ?? DEFAULT_FREIGHT_CHARGE_CURRENCY,
    cbm: row.cbm ?? null,
    net_weight_mt: row.net_weight_mt ?? null,
    gross_weight_mt: row.gross_weight_mt ?? null,
    bm: bmAmount,
    kawasan_berikat: row.kawasan_berikat ?? null,
    surveyor: row.surveyor ?? null,
    product_classification: normalizeProductClassificationForApi(row.product_classification),
    unit_20ft: row.unit_20ft ?? false,
    unit_40ft: row.unit_40ft ?? false,
    unit_package: row.unit_package ?? false,
    unit_20_iso_tank: row.unit_20_iso_tank ?? false,
    container_count_20ft: row.container_count_20ft ?? null,
    container_count_40ft: row.container_count_40ft ?? null,
    package_count: row.package_count ?? null,
    container_count_20_iso_tank: row.container_count_20_iso_tank ?? null,
    total_items_amount: totalItemsAmount,
    ppn,
    pph,
    pdri,
    linked_pos: linkedPos,
  };
}

export class ShipmentService {
  constructor(
    private readonly repo: ShipmentRepository,
    private readonly mappingRepo: ShipmentPoMappingRepository,
    private readonly lineReceivedRepo?: ShipmentPoLineReceivedRepository,
    private readonly updateLogRepo: ShipmentUpdateLogRepository = new ShipmentUpdateLogRepository(),
    private readonly statusHistoryRepo: ShipmentStatusHistoryRepository = new ShipmentStatusHistoryRepository()
  ) {}

  /**
   * Total invoice in IDR for the shipment. Linked POs share one currency and one FX rate (enforced when coupling).
   * IDR/RP: Σ(delivered_qty × unit_price) across all POs.
   * Other: same sum in PO currency × single group currency_rate (read from any mapping row; identical per business rule).
   */
  private async getShipmentTotalPoAmountIdr(
    shipmentId: string,
    linked: Array<{ intake_id: string; currency_rate: number | null; currency: string | null }>
  ): Promise<number> {
    if (!this.lineReceivedRepo || linked.length === 0) return 0;

    let sumInPoCurrency = 0;
    for (const po of linked) {
      const items = await poIntakeRepo.findItemsByIntakeId(po.intake_id);
      const unitPriceByItem = new Map(items.map((it) => [it.id, Number(it.value ?? 0)]));
      const received = await this.lineReceivedRepo.findByShipmentAndIntake(shipmentId, po.intake_id);
      const poSubtotal = received.reduce((sum, line) => {
        const unitPrice = unitPriceByItem.get(line.item_id) ?? 0;
        const deliveredQty = Number(line.received_qty ?? 0);
        const price = Number.isFinite(unitPrice) ? unitPrice : 0;
        const qty = Number.isFinite(deliveredQty) ? deliveredQty : 0;
        return sum + price * qty;
      }, 0);
      sumInPoCurrency += poSubtotal;
    }

    const groupCurrency = linked[0]?.currency;
    if (isPoCurrencyIdr(groupCurrency)) {
      return sumInPoCurrency;
    }

    let groupRate: number | null = null;
    for (const po of linked) {
      const r = po.currency_rate != null ? Number(po.currency_rate) : NaN;
      if (Number.isFinite(r) && r > 0) {
        groupRate = r;
        break;
      }
    }
    return sumInPoCurrency * (groupRate ?? 1);
  }

  /**
   * BM/PPN/PPH totals are user-entered on shipment; PDRI = BM + PPN + PPH.
   * BC 2.3 → all duty values are treated as zero.
   */
  private async computeDutyAmounts(
    pibType: string | null | undefined,
    storedBmAmount: number,
    storedPpnAmount: number,
    storedPphAmount: number
  ): Promise<{ bm: number; ppn: number; pph: number; pdri: number }> {
    const bm = Number.isFinite(storedBmAmount) ? storedBmAmount : 0;
    const ppn = Number.isFinite(storedPpnAmount) ? storedPpnAmount : 0;
    const pph = Number.isFinite(storedPphAmount) ? storedPphAmount : 0;
    if (isPibTypeBc23(pibType)) {
      return { bm: 0, ppn: 0, pph: 0, pdri: 0 };
    }
    const pdri = bm + ppn + pph;
    return { bm, ppn, pph, pdri };
  }

  /** BM is now user-entered; keep legacy calls as no-op. */
  private async syncComputedBmToDb(shipmentId: string): Promise<void> {
    void shipmentId;
  }

  /**
   * @param initialStatusActor — shown on timeline for INITIATE_SHIPPING_DOCUMENT (e.g. user who created shipment from PO claim).
   */
  async create(dto: CreateShipmentDto, initialStatusActor?: string): Promise<CreateShipmentResponse> {
    const etdC = dto.etd?.trim().slice(0, 10);
    const etaC = dto.eta?.trim().slice(0, 10);
    if (
      etdC &&
      etaC &&
      /^\d{4}-\d{2}-\d{2}$/.test(etdC) &&
      /^\d{4}-\d{2}-\d{2}$/.test(etaC) &&
      etaC <= etdC
    ) {
      throw new AppError("ETA must be after ETD", 400, [
        { field: "eta", message: "ETA must be a date after ETD" },
      ]);
    }
    const year = new Date().getFullYear();
    const shipmentNo = await this.repo.getNextShipmentNo(year);
    const row = await this.repo.create(dto, shipmentNo);
    const actor = (initialStatusActor ?? "System").trim() || "System";
    await this.statusHistoryRepo.create({
      shipmentId: row.id,
      previousStatus: null,
      newStatus: "INITIATE_SHIPPING_DOCUMENT",
      remarks: null,
      changedBy: actor,
    });
    return {
      id: row.id,
      shipment_number: row.shipment_no,
      current_status: row.current_status,
      created_at: row.created_at.toISOString(),
    };
  }

  getCombinedImportTemplateCsv(): string {
    const header = SHIPMENT_CSV_TEMPLATE_HEADER_ORDER.join(",");
    const row1 =
      "PO-0001,1,100,10,11,2.5,DHL,SEA,Shanghai,China,Tanjung Priok,Indonesia,2026-04-02,2026-04-10,,,Chemical,BC 2.0,PIB-REQ-001,NOP-001,2026-04-05,BL123456,INS-001,ID,12.5,500,1.2,1.5,125000000,10000000,1100000,500000,11600000,,INV-001,16250,Trial import";
    const row2 =
      "PO-0002,1,50,10,11,2.5,DHL,SEA,Shanghai,China,Tanjung Priok,Indonesia,2026-04-02,2026-04-10,,,Spare Parts,Lartas,PIB-REQ-001,NOP-001,2026-04-05,BL123456,INS-001,ID,12.5,500,1.2,1.5,125000000,10000000,1100000,500000,11600000,,INV-002,16250,Trial import";
    const hints = SHIPMENT_CSV_TEMPLATE_HINT_LINES.join("\n");
    return `${header}\n${row1}\n${row2}\n${hints}\n`;
  }

  async importCombinedFromCsv(
    csvText: string,
    actorName: string,
    fileName: string | null
  ): Promise<ShipmentCsvImportResult> {
    const lines = splitCsvTextToDataLines(csvText);
    if (lines.length < 2) throw new AppError("CSV must include a header row and at least one data row", 400);

    const delim = detectCsvDelimiter(stripBom(lines[0]!));
    const headerCells = parseCsvLine(stripBom(lines[0]!), delim);
    const { indices, ambiguous } = resolveCsvColumnIndices(headerCells, SHIPMENT_CSV_CANONICAL_FIELDS, SHIPMENT_CSV_ALIASES);
    if (ambiguous.length > 0) {
      throw new AppError(`Ambiguous CSV column(s): ${[...new Set(ambiguous)].join(", ")}`, 400);
    }
    const requiredCore = ["line_number", "delivered_qty"] as const;
    const missingCore = requiredCore.filter((k) => indices[k] === undefined);
    const detailLabel = (k: string) => SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL[k] ?? k;
    if (missingCore.length > 0) {
      throw new AppError(
        `Missing required CSV column(s): ${missingCore.map(detailLabel).join(", ")}. ` +
          `Headers should match the shipment detail screen (see downloadable template). ` +
          `Excel often uses ";" between columns — that is detected automatically.`,
        400
      );
    }
    if (indices.po_number === undefined && indices.intake_id === undefined) {
      throw new AppError(
        `Missing PO link column: include "${detailLabel("po_number")}" and/or "${detailLabel("intake_id")}".`,
        400
      );
    }

    const idx = (k: string) => indices[k] ?? -1;

    const errors: ShipmentCsvImportErrorRow[] = [];
    const byShipment = new Map<
      string,
      Array<{
        row: number;
        /** Shipment group id or legacy shipment_no — shown in error reports. */
        group_label: string;
        is_legacy_shipment_no: boolean;
        legacy_shipment_no?: string;
        po_number: string;
        intake_id_raw?: string;
        line_number: number;
        delivered_qty: number;
        invoice_no?: string;
        currency_rate?: number;
        currency?: string;
        pt?: string;
        plant?: string;
        shipment_fields: UpdateShipmentDto;
        bm_percentage?: number | null;
        ppn_percentage?: number | null;
        pph_percentage?: number | null;
      }>
    >();

    let skippedEmptyBodyRows = 0;
    for (let i = 1; i < lines.length; i++) {
      const row = i + 1;
      const cells = parseCsvLine(lines[i]!, delim);
      const shipmentNoLegacy = csvCell(cells, idx("shipment_no")).trim();
      const poNumber = csvCell(cells, idx("po_number")).trim();
      const intakeRaw = csvCell(cells, idx("intake_id")).trim();
      const poRefLabel = poNumber || intakeRaw;
      const groupLabel = shipmentNoLegacy || "—";

      if (!shipmentNoLegacy && !poNumber && !intakeRaw) {
        const anyValue = cells.some((c) => c.trim().length > 0);
        if (!anyValue) {
          skippedEmptyBodyRows += 1;
          continue;
        }
      }
      const lineNoParsed = parseInternationalNumber(csvCell(cells, idx("line_number")).trim());
      const lineNoRaw = lineNoParsed != null && Number.isInteger(lineNoParsed) ? lineNoParsed : NaN;
      const deliverRaw = parseInternationalNumber(csvCell(cells, idx("delivered_qty")).trim()) ?? NaN;
      if (!poNumber && !intakeRaw) {
        errors.push({
          row,
          field: "po_number",
          shipment_no: groupLabel,
          po_number: "",
          message: `Either ${SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL.po_number} or ${SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL.intake_id} is required`,
        });
      }
      if (!Number.isInteger(lineNoRaw) || lineNoRaw < 1) {
        errors.push({ row, field: "line_number", shipment_no: groupLabel, po_number: poRefLabel, message: "line_number must be an integer >= 1" });
      }
      if (!Number.isFinite(deliverRaw) || deliverRaw < 0) {
        errors.push({
          row,
          field: "delivered_qty",
          shipment_no: groupLabel,
          po_number: poRefLabel,
          message: `${SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL.delivered_qty} must be a non-negative number`,
        });
      }
      const crText = csvCell(cells, idx("currency_rate")).trim();
      const currencyRate = crText ? parseInternationalNumber(crText) : undefined;
      if (crText && (currencyRate == null || currencyRate <= 0)) {
        errors.push({
          row,
          field: "currency_rate",
          shipment_no: groupLabel,
          po_number: poRefLabel,
          message: "currency_rate must be a positive number",
        });
      }
      if (
        (!poNumber && !intakeRaw) ||
        !Number.isInteger(lineNoRaw) ||
        lineNoRaw < 1 ||
        !Number.isFinite(deliverRaw) ||
        deliverRaw < 0
      )
        continue;

      let rowFieldErrors = false;
      const optDate = (key: string, fieldLabel: string): string | undefined => {
        const v = csvCell(cells, idx(key)).trim();
        if (!v) return undefined;
        if (!isValidDateString(v)) {
          errors.push({ row, field: key, shipment_no: groupLabel, po_number: poRefLabel, message: `${fieldLabel} must be a valid date` });
          rowFieldErrors = true;
          return undefined;
        }
        return normalizeCsvDateToApi(v);
      };
      const optNonNeg = (key: string, label: string): number | undefined => {
        const t = csvCell(cells, idx(key)).trim();
        if (!t) return undefined;
        const n = parseInternationalNumber(t);
        if (n == null || n < 0) {
          errors.push({ row, field: key, shipment_no: groupLabel, po_number: poRefLabel, message: `${label} must be a non-negative number` });
          rowFieldErrors = true;
          return undefined;
        }
        return n;
      };

      const etd = optDate("etd", "etd");
      const eta = optDate("eta", "eta");
      if (etd && eta) {
        const etdY = etd.slice(0, 10);
        const etaY = eta.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(etdY) && /^\d{4}-\d{2}-\d{2}$/.test(etaY) && etaY <= etdY) {
          errors.push({
            row,
            field: "eta",
            shipment_no: groupLabel,
            po_number: poRefLabel,
            message: "eta must be after etd",
          });
          rowFieldErrors = true;
        }
      }
      const atd = optDate("atd", "atd");
      const ata = optDate("ata", "ata");
      const nopen_date = optDate("nopen_date", "nopen_date");
      const delivered_at = optDate("delivered_at", "delivered_at");

      const bmPctText = csvCell(cells, idx("bm_percentage")).trim();
      let bm_percentage: number | undefined;
      if (bmPctText) {
        const n = parseInternationalNumber(bmPctText);
        if (n == null || n < 0 || n > 100) {
          errors.push({
            row,
            field: "bm_percentage",
            shipment_no: groupLabel,
            po_number: poRefLabel,
            message: "bm_percentage must be between 0 and 100",
          });
          rowFieldErrors = true;
        } else bm_percentage = n;
      }

      const pct0to100 = (headerKey: "ppn_percentage" | "pph_percentage", fieldLabel: string): number | undefined => {
        const t = csvCell(cells, idx(headerKey)).trim();
        if (!t) return undefined;
        const n = parseInternationalNumber(t);
        if (n == null || n < 0 || n > 100) {
          errors.push({
            row,
            field: headerKey,
            shipment_no: groupLabel,
            po_number: poRefLabel,
            message: `${fieldLabel} must be between 0 and 100`,
          });
          rowFieldErrors = true;
          return undefined;
        }
        return n;
      };
      const ppn_percentage = pct0to100("ppn_percentage", "ppn_percentage");
      const pph_percentage = pct0to100("pph_percentage", "pph_percentage");

      const optIdrDutyTotal = (
        canonical: "bm" | "ppn_amount" | "pph_amount" | "pdri",
        detailLabel: string
      ): number | undefined => {
        const t = csvCell(cells, idx(canonical)).trim();
        if (!t) return undefined;
        const n = parseInternationalNumber(t);
        if (n == null || n < 0) {
          errors.push({
            row,
            field: canonical,
            shipment_no: groupLabel,
            po_number: poRefLabel,
            message: `${detailLabel} must be a non-negative number`,
          });
          rowFieldErrors = true;
          return undefined;
        }
        return n;
      };

      const bmTotal = optIdrDutyTotal("bm", SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL.bm);
      const ppnTotal = optIdrDutyTotal("ppn_amount", SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL.ppn_amount);
      const pphTotal = optIdrDutyTotal("pph_amount", SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL.pph_amount);
      const pdriDeclared = optIdrDutyTotal("pdri", SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL.pdri);

      if (
        pdriDeclared != null &&
        bmTotal !== undefined &&
        ppnTotal !== undefined &&
        pphTotal !== undefined &&
        Math.abs(bmTotal + ppnTotal + pphTotal - pdriDeclared) > 0.01
      ) {
        errors.push({
          row,
          field: "pdri",
          shipment_no: groupLabel,
          po_number: poRefLabel,
          message: "PDRI (total) must equal BM (total) + PPN (total) + PPH (total)",
        });
        rowFieldErrors = true;
      }

      const cbm = optNonNeg("cbm", "cbm");
      const incoterm_amount = optNonNeg("incoterm_amount", "incoterm_amount (Service & Charge)");
      const incoterm_currency_cell = csvCell(cells, idx("incoterm_currency")).trim();
      let incoterm_currencyFromCsv: UpdateShipmentDto["incoterm_currency"] | undefined;
      if (incoterm_currency_cell) {
        const cur = normalizeFreightChargeCurrency(incoterm_currency_cell);
        if (!cur) {
          errors.push({
            row,
            field: "incoterm_currency",
            shipment_no: groupLabel,
            po_number: poRefLabel,
            message: `${SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL.incoterm_currency} must be USD or IDR`,
          });
          rowFieldErrors = true;
        } else {
          incoterm_currencyFromCsv = cur;
        }
      }
      const net_weight_mt = optNonNeg("net_weight_mt", "net_weight_mt");
      const gross_weight_mt = optNonNeg("gross_weight_mt", "gross_weight_mt");

      const remarksBase = csvCell(cells, idx("remarks")).trim() || undefined;
      const totalPoRaw = csvCell(cells, idx("total_po_amount"));
      const remarks = buildRemarksWithTotalPo(remarksBase, totalPoRaw);

      const dto: UpdateShipmentDto = {
        vendor_name: csvCell(cells, idx("vendor_name")).trim() || undefined,
        forwarder_name: csvCell(cells, idx("forwarder_name")).trim() || undefined,
        incoterm: csvCell(cells, idx("incoterm")).trim() || undefined,
        shipment_method: csvCell(cells, idx("shipment_method")).trim() || undefined,
        origin_port_name: csvCell(cells, idx("origin_port_name")).trim() || undefined,
        origin_port_country: csvCell(cells, idx("origin_port_country")).trim() || undefined,
        destination_port_name: csvCell(cells, idx("destination_port_name")).trim() || undefined,
        destination_port_country: csvCell(cells, idx("destination_port_country")).trim() || undefined,
        etd,
        eta,
        atd,
        ata,
        product_classification: csvCell(cells, idx("product_classification")).trim() || undefined,
        pib_type: csvCell(cells, idx("pib_type")).trim() || undefined,
        no_request_pib: csvCell(cells, idx("no_request_pib")).trim() || undefined,
        nopen: csvCell(cells, idx("nopen")).trim() || undefined,
        nopen_date,
        bl_awb: csvCell(cells, idx("bl_awb")).trim() || undefined,
        insurance_no: csvCell(cells, idx("insurance_no")).trim() || undefined,
        coo: csvCell(cells, idx("coo")).trim() || undefined,
        cbm,
        incoterm_amount,
        ...(incoterm_currencyFromCsv !== undefined ? { incoterm_currency: incoterm_currencyFromCsv } : {}),
        net_weight_mt,
        gross_weight_mt,
        closed_at: delivered_at,
        remarks,
        ...(bmTotal !== undefined ? { bm: bmTotal } : {}),
        ...(ppnTotal !== undefined ? { ppn_amount: ppnTotal } : {}),
        ...(pphTotal !== undefined ? { pph_amount: pphTotal } : {}),
      };
      if (rowFieldErrors) continue;
      const groupStorageKey = shipmentNoLegacy
        ? `L:${shipmentNoLegacy}`
        : `S:${stableShipmentFieldsSignature(dto)}`;
      const arr = byShipment.get(groupStorageKey) ?? [];
      arr.push({
        row,
        group_label: groupLabel,
        is_legacy_shipment_no: Boolean(shipmentNoLegacy),
        legacy_shipment_no: shipmentNoLegacy || undefined,
        po_number: poNumber,
        intake_id_raw: intakeRaw || undefined,
        line_number: lineNoRaw,
        delivered_qty: deliverRaw,
        invoice_no: csvCell(cells, idx("invoice_no")).trim() || undefined,
        currency_rate: currencyRate,
        currency: csvCell(cells, idx("currency")).trim() || undefined,
        pt: csvCell(cells, idx("pt")).trim() || undefined,
        plant: csvCell(cells, idx("plant")).trim() || undefined,
        shipment_fields: dto,
        bm_percentage: bm_percentage ?? null,
        ppn_percentage: ppn_percentage ?? null,
        pph_percentage: pph_percentage ?? null,
      });
      byShipment.set(groupStorageKey, arr);
    }

    let importedShipments = 0;
    let importedRows = 0;
    for (const [, rows] of byShipment) {
      type CsvShipmentRow = (typeof rows)[number];

      const resolveIntakeForRow = async (r: CsvShipmentRow): Promise<PoIntakeRow | null> => {
        if (r.intake_id_raw) {
          const idTrim = r.intake_id_raw.trim();
          if (!isUuidString(idTrim)) {
            errors.push({
              row: r.row,
              field: "intake_id",
              shipment_no: r.group_label,
              po_number: idTrim,
              message: "intake_id must be a valid UUID",
            });
            return null;
          }
          const intake = await poIntakeRepo.findById(idTrim);
          if (!intake) {
            errors.push({
              row: r.row,
              field: "intake_id",
              shipment_no: r.group_label,
              po_number: idTrim,
              message: "PO intake not found for intake_id",
            });
            return null;
          }
          return intake;
        }
        const resolvedId = await poIntakeRepo.findIdByPoNumberTrimmed(r.po_number);
        if (!resolvedId) {
          errors.push({
            row: r.row,
            field: "po_number",
            shipment_no: r.group_label,
            po_number: r.po_number,
            message: "PO not found in system",
          });
          return null;
        }
        const intake = await poIntakeRepo.findById(resolvedId);
        if (!intake) {
          errors.push({
            row: r.row,
            field: "po_number",
            shipment_no: r.group_label,
            po_number: r.po_number,
            message: "PO not found in system",
          });
          return null;
        }
        return intake;
      };

      const mergedRows: Array<CsvShipmentRow & { intake: PoIntakeRow; shipment_fields: UpdateShipmentDto }> = [];
      let resolveFailed = false;
      for (const r of rows) {
        const intake = await resolveIntakeForRow(r);
        if (!intake) {
          resolveFailed = true;
          continue;
        }
        mergedRows.push({
          ...r,
          intake,
          shipment_fields: applyPoIntakeDefaultsToShipmentDto(r.shipment_fields, intake),
          currency: r.currency?.trim() || intake.currency?.trim() || undefined,
        });
      }
      if (resolveFailed) continue;

      const firstRowForInv = mergedRows[0]!;
      const firstInv = firstRowForInv.invoice_no?.trim() ?? "";
      const firstCr = firstRowForInv.currency_rate;
      let invoiceRateMismatch = false;
      for (const r of mergedRows.slice(1)) {
        const inv = r.invoice_no?.trim() ?? "";
        if (inv) {
          if (!firstInv) {
            errors.push({
              row: r.row,
              field: "invoice_no",
              shipment_no: r.group_label,
              po_number: r.po_number,
              message:
                "Invoice no. is shipment-level: enter it on the first data row of this shipment group, or leave blank on all rows.",
            });
            invoiceRateMismatch = true;
          } else if (inv !== firstInv) {
            errors.push({
              row: r.row,
              field: "invoice_no",
              shipment_no: r.group_label,
              po_number: r.po_number,
              message: "Invoice no. must match the first row of this shipment (or leave blank on additional rows).",
            });
            invoiceRateMismatch = true;
          }
        }
        const cr = r.currency_rate;
        if (cr != null) {
          if (firstCr == null) {
            errors.push({
              row: r.row,
              field: "currency_rate",
              shipment_no: r.group_label,
              po_number: r.po_number,
              message:
                "Currency rate is shipment-level: enter it on the first data row of this shipment group, or leave blank on all rows.",
            });
            invoiceRateMismatch = true;
          } else if (Math.abs(cr - firstCr) > 1e-9) {
            errors.push({
              row: r.row,
              field: "currency_rate",
              shipment_no: r.group_label,
              po_number: r.po_number,
              message: "Currency rate must match the first row of this shipment (or leave blank on additional rows).",
            });
            invoiceRateMismatch = true;
          }
        }
      }
      if (invoiceRateMismatch) continue;

      const firstM = mergedRows[0]!;
      const inconsistent = mergedRows.some(
        (r) => JSON.stringify(r.shipment_fields) !== JSON.stringify(firstM.shipment_fields)
      );
      if (inconsistent) {
        const groupHint = firstM.is_legacy_shipment_no
          ? SHIPMENT_CSV_CANONICAL_TO_DETAIL_LABEL.shipment_no
          : "shipment-level column values (including values filled from PO when omitted in CSV)";
        for (const r of rows) {
          errors.push({
            row: r.row,
            field: "shipment",
            shipment_no: r.group_label,
            po_number: r.po_number,
            message: `Rows targeting the same shipment (${groupHint}) must share identical shipment fields`,
          });
        }
        continue;
      }

      let shipmentId: string;

      if (firstM.is_legacy_shipment_no && firstM.legacy_shipment_no) {
        const legacyNo = firstM.legacy_shipment_no;
        const existing = await this.repo.findByShipmentNo(legacyNo);
        if (existing) {
          shipmentId = existing.id;
          await this.update(existing.id, withoutClosedAtForCsvCoupling(firstM.shipment_fields));
        } else {
          const created = await this.repo.create(combinedRowToCreateDto(firstM.shipment_fields), legacyNo);
          shipmentId = created.id;
          await this.statusHistoryRepo.create({
            shipmentId,
            previousStatus: null,
            newStatus: "INITIATE_SHIPPING_DOCUMENT",
            remarks: null,
            changedBy: "CSV import",
          });
          await this.update(shipmentId, withoutClosedAtForCsvCoupling(firstM.shipment_fields));
        }
      } else {
        const newShipmentNo = await this.repo.getNextShipmentNo(new Date().getFullYear());
        const created = await this.repo.create(combinedRowToCreateDto(firstM.shipment_fields), newShipmentNo);
        shipmentId = created.id;
        await this.statusHistoryRepo.create({
          shipmentId,
          previousStatus: null,
          newStatus: "INITIATE_SHIPPING_DOCUMENT",
          remarks: null,
          changedBy: "CSV import",
        });
        await this.update(shipmentId, withoutClosedAtForCsvCoupling(firstM.shipment_fields));
      }

      const byIntake = new Map<
        string,
        Array<{
          row: number;
          po_number: string;
          item_id: string;
          received_qty: number;
          bm_percentage?: number | null;
          ppn_percentage?: number | null;
          pph_percentage?: number | null;
        }>
      >();
      let hasGroupError = false;
      for (const r of mergedRows) {
        const intake = r.intake;
        const intakeId = intake.id;
        const poLabel = r.po_number || intake.po_number;

        if (r.currency && normalizeGroupField(r.currency) !== normalizeGroupField(intake.currency)) {
          errors.push({
            row: r.row,
            field: "currency",
            shipment_no: r.group_label,
            po_number: poLabel,
            message: `currency must match PO in system (${intake.currency ?? "—"})`,
          });
          hasGroupError = true;
          continue;
        }
        if (r.pt && normalizeGroupField(r.pt) !== normalizeGroupField(intake.pt)) {
          errors.push({
            row: r.row,
            field: "pt",
            shipment_no: r.group_label,
            po_number: poLabel,
            message: `pt must match PO in system (${intake.pt ?? "—"})`,
          });
          hasGroupError = true;
          continue;
        }
        if (r.plant && normalizeGroupField(r.plant) !== normalizeGroupField(intake.plant)) {
          errors.push({
            row: r.row,
            field: "plant",
            shipment_no: r.group_label,
            po_number: poLabel,
            message: `plant must match PO in system (${intake.plant ?? "—"})`,
          });
          hasGroupError = true;
          continue;
        }
        const poItems = await poIntakeRepo.findItemsByIntakeId(intakeId);
        const item = poItems.find((x) => x.line_number === r.line_number);
        if (!item) {
          errors.push({
            row: r.row,
            field: "line_number",
            shipment_no: r.group_label,
            po_number: poLabel,
            message: `PO line ${r.line_number} not found`,
          });
          hasGroupError = true;
          continue;
        }
        const a = byIntake.get(intakeId) ?? [];
        a.push({
          row: r.row,
          po_number: poLabel,
          item_id: item.id,
          received_qty: r.delivered_qty,
          bm_percentage: r.bm_percentage ?? null,
          ppn_percentage: r.ppn_percentage ?? null,
          pph_percentage: r.pph_percentage ?? null,
        });
        byIntake.set(intakeId, a);
      }
      if (hasGroupError) continue;

      try {
        for (const [intakeId, list] of byIntake) {
          const isCoupled = await this.mappingRepo.isCoupled(shipmentId, intakeId);
          if (!isCoupled) {
            await this.couplePo(shipmentId, [intakeId], "CSV Import");
          }
          if (firstM.invoice_no !== undefined || firstM.currency_rate !== undefined) {
            await this.updatePoMapping(shipmentId, intakeId, {
              invoice_no: firstM.invoice_no?.trim() ? firstM.invoice_no.trim() : null,
              currency_rate: firstM.currency_rate ?? null,
            });
          }
          await this.updatePoLines(
            shipmentId,
            intakeId,
            list.map((x) => ({
              item_id: x.item_id,
              received_qty: x.received_qty,
              bm_percentage: x.bm_percentage ?? null,
              ppn_percentage: x.ppn_percentage ?? null,
              pph_percentage: x.pph_percentage ?? null,
            }))
          );
        }
        if (firstM.shipment_fields.closed_at !== undefined) {
          await this.update(shipmentId, { closed_at: firstM.shipment_fields.closed_at });
        }
        importedShipments += 1;
        importedRows += rows.length;
      } catch (e) {
        const message = e instanceof AppError ? e.message : "Failed to import shipment group";
        for (const r of rows) {
          errors.push({ row: r.row, field: "shipment", shipment_no: r.group_label, po_number: r.po_number, message });
        }
      }
    }

    const totalBodyRows = lines.length - 1 - skippedEmptyBodyRows;
    const out: ShipmentCsvImportResult = {
      total_rows: totalBodyRows,
      imported_shipments: importedShipments,
      imported_rows: importedRows,
      failed_rows: totalBodyRows - importedRows,
      summary: "",
      errors: errors.sort((a, b) => a.row - b.row),
    };
    out.summary = buildShipmentCsvImportSummary(out);

    const status: "SUCCESS" | "PARTIAL" | "FAILED" =
      out.imported_rows === 0 ? "FAILED" : out.errors.length > 0 ? "PARTIAL" : "SUCCESS";
    await this.repo.createShipmentImportHistory({
      fileName,
      uploadedBy: actorName,
      totalRows: out.total_rows,
      importedShipments: out.imported_shipments,
      importedRows: out.imported_rows,
      failedRows: out.failed_rows,
      status,
    });

    return out;
  }

  async listShipmentImportHistory(limit?: number): Promise<
    Array<{
      id: string;
      file_name: string | null;
      uploaded_by: string;
      total_rows: number;
      imported_shipments: number;
      imported_rows: number;
      failed_rows: number;
      status: string;
      created_at: string;
      finished_at: string | null;
    }>
  > {
    const rows = await this.repo.listShipmentImportHistory(limit);
    return rows.map((r) => ({
      id: r.id,
      file_name: r.file_name,
      uploaded_by: r.uploaded_by,
      total_rows: r.total_rows,
      imported_shipments: r.imported_shipments,
      imported_rows: r.imported_rows,
      failed_rows: r.failed_rows,
      status: r.status,
      created_at: r.created_at.toISOString(),
      finished_at: r.finished_at ? r.finished_at.toISOString() : null,
    }));
  }

  async list(query: ListShipmentsQuery): Promise<{ items: ShipmentListItem[]; total: number }> {
    const { rows, total } = await this.repo.findAll(query);
    const ids = rows.map((r) => r.id);
    const byShipment = await this.mappingRepo.findActiveLinkedPosWithItemsByShipmentIds(ids);
    const items = rows.map((row) => toListItem(row, byShipment.get(row.id) ?? []));
    return { items, total };
  }

  async listFilterOptions(): Promise<ShipmentListFilterOptions> {
    return this.repo.listDistinctFilterOptions();
  }

  async getById(id: string): Promise<ShipmentDetail | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;
    const linked = await this.mappingRepo.findActiveByShipmentId(id);
    const linkedPos = await Promise.all(
      linked.map(async (l) => {
        const lines = this.lineReceivedRepo ? await this.lineReceivedRepo.findByShipmentAndIntake(id, l.intake_id) : [];
        return toLinkedSummary(l, lines);
      })
    );
    const totalItemsAmount = await this.getShipmentTotalPoAmountIdr(
      id,
      linked.map((l) => ({ intake_id: l.intake_id, currency_rate: l.currency_rate, currency: l.currency }))
    );
    const bmAmt = row.bm != null ? Number(row.bm) : 0;
    const ppnAmt = row.ppn_amount != null ? Number(row.ppn_amount) : 0;
    const pphAmt = row.pph_amount != null ? Number(row.pph_amount) : 0;
    const duty = await this.computeDutyAmounts(
      row.pib_type,
      bmAmt,
      ppnAmt,
      pphAmt
    );
    return toDetail(row, linkedPos, totalItemsAmount, duty);
  }

  async update(id: string, dto: UpdateShipmentDto, changedBy?: string): Promise<ShipmentDetail | null> {
    const existing = await this.repo.findById(id);
    if (!existing) return null;
    if (existing.closed_at) {
      throw new AppError("Cannot update a closed shipment", 409);
    }

    const effectiveEtd =
      dto.etd !== undefined
        ? dto.etd.trim()
          ? shipmentDateToYmd(dto.etd)
          : null
        : shipmentDateToYmd(existing.etd);
    const effectiveEta =
      dto.eta !== undefined
        ? dto.eta.trim()
          ? shipmentDateToYmd(dto.eta)
          : null
        : shipmentDateToYmd(existing.eta);
    if (effectiveEtd && effectiveEta && effectiveEta <= effectiveEtd) {
      throw new AppError("ETA must be after ETD", 400, [
        { field: "eta", message: "ETA must be a date after ETD" },
      ]);
    }

    const beforeUpdatedAt = existing.updated_at.getTime();
    const row = await this.repo.update(id, dto);
    if (!row) return null;
    const keys = collectUpdateShipmentFieldKeys(dto);
    const fieldChanges = collectUpdateFieldChanges(existing, row, keys);
    if (fieldChanges.length > 0 && changedBy && row.updated_at.getTime() > beforeUpdatedAt) {
      await this.updateLogRepo.create({
        shipmentId: id,
        changedBy,
        fieldsChanged: fieldChanges.map((x) => x.field),
        fieldChanges,
      });
    }
    await this.syncComputedBmToDb(id);
    return this.getById(id);
  }

  async close(id: string, reason: string | null): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Shipment not found", 404);
    if (existing.closed_at) throw new AppError("Shipment is already closed", 409);
    await this.repo.close(id, reason);
  }

  /**
   * Soft-delete: decouple all POs, sync intake status, then set deleted_at.
   * Row remains for audit; excluded from operational queries.
   */
  async softDelete(id: string, deletedBy: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new AppError("Shipment not found", 404);
    const intakeIds = await this.mappingRepo.decoupleAllActiveForShipment(
      id,
      deletedBy,
      "Shipment removed (soft delete)"
    );
    for (const intakeId of intakeIds) {
      await syncPoIntakeStatus(intakeId);
    }
    const row = await this.repo.softDelete(id, deletedBy);
    if (!row) throw new AppError("Shipment could not be deleted", 409);
  }

  async couplePo(shipmentId: string, intakeIds: string[], coupledBy: string): Promise<ShipmentDetail | null> {
    const shipment = await this.repo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);
    if (shipment.closed_at) throw new AppError("Cannot couple PO to a closed shipment", 409);

    const uniqueIds = [...new Set(intakeIds)];
    const existing = await this.mappingRepo.findActiveByShipmentId(shipmentId);
    const incoming: PoIntakeRow[] = [];
    for (const intakeId of uniqueIds) {
      const intake = await poIntakeRepo.findById(intakeId);
      if (!intake) throw new AppError(`PO intake not found: ${intakeId}`, 404);
      incoming.push(intake);
    }

    if (incoming.length > 0) {
      if (existing.length > 0) {
        const ref = existing[0]!;
        const refInco = normalizeGroupField(ref.incoterm_location);
        const refCur = normalizeGroupField(ref.currency);
        for (const intake of incoming) {
          if (normalizeGroupField(intake.incoterm_location) !== refInco) {
            throw new AppError(
              `PO ${intake.po_number}: incoterm must match this shipment group (${ref.incoterm_location ?? "—"}).`,
              400
            );
          }
          if (normalizeGroupField(intake.currency) !== refCur) {
            throw new AppError(
              `PO ${intake.po_number}: currency must match this shipment group (${ref.currency ?? "—"}).`,
              400
            );
          }
        }
      } else {
        const shipInco = normalizeGroupField(shipment.incoterm);
        const first = incoming[0]!;
        const baseInco = normalizeGroupField(first.incoterm_location);
        const baseCur = normalizeGroupField(first.currency);
        if (shipInco && baseInco !== shipInco) {
          throw new AppError(
            `PO ${first.po_number}: incoterm must match shipment incoterm (${shipment.incoterm ?? "—"}).`,
            400
          );
        }
        for (const intake of incoming) {
          if (normalizeGroupField(intake.incoterm_location) !== baseInco) {
            throw new AppError(
              `All POs in one group must share the same incoterm (see ${first.po_number}).`,
              400
            );
          }
          if (normalizeGroupField(intake.currency) !== baseCur) {
            throw new AppError(
              `All POs in one group must share the same currency (see ${first.po_number}).`,
              400
            );
          }
        }
      }
    }

    for (const intakeId of uniqueIds) {
      await this.mappingRepo.couple(shipmentId, intakeId, coupledBy);
      await syncPoIntakeStatus(intakeId);
    }

    await this.syncComputedBmToDb(shipmentId);
    return this.getById(shipmentId);
  }

  async decouplePo(shipmentId: string, intakeId: string, decoupledBy: string, reason: string | null): Promise<void> {
    const shipment = await this.repo.findById(shipmentId);
    if (!shipment) throw new AppError("Shipment not found", 404);

    const updated = await this.mappingRepo.decouple(shipmentId, intakeId, decoupledBy, reason);
    if (!updated) throw new AppError("PO is not coupled to this shipment or already decoupled", 404);
    await syncPoIntakeStatus(intakeId);
    await this.syncComputedBmToDb(shipmentId);
  }

  /** Update invoice_no and/or currency_rate for a linked PO. */
  async updatePoMapping(
    shipmentId: string,
    intakeId: string,
    data: { invoice_no?: string | null; currency_rate?: number | null }
  ): Promise<ShipmentDetail | null> {
    const shipment = await this.repo.findById(shipmentId);
    if (!shipment) return null;
    const intake = await poIntakeRepo.findById(intakeId);
    if (!intake) throw new AppError("PO intake not found", 404);

    if (data.currency_rate !== undefined) {
      const cur = String(intake.currency ?? "")
        .trim()
        .toUpperCase();
      const isIdr = cur === "IDR";
      const enforceRate = isAtOrPastCustomsClearance(shipment.current_status);
      if (isIdr) {
        if (data.currency_rate != null && data.currency_rate !== 0) {
          throw new AppError("Currency rate must be empty or zero for IDR PO lines.", 400);
        }
        data = { ...data, currency_rate: null };
      } else if (enforceRate) {
        const r = data.currency_rate;
        if (r == null || !Number.isFinite(Number(r)) || Number(r) <= 0) {
          throw new AppError(
            "Currency rate is required and must be greater than 0 for non-IDR currency at this shipment status.",
            400
          );
        }
      }
    }

    const updated = await this.mappingRepo.updateMapping(shipmentId, intakeId, data);
    if (!updated) return null;
    return this.getById(shipmentId);
  }

  /**
   * Update delivered qty per line for a linked PO.
   * Totals for Bulk validation sum `received_qty` for this PO line across every **active** shipment–PO link
   * (same intake, mapping not decoupled). Shipment lifecycle status does not matter — in-progress and delivered
   * shipments both contribute.
   * When Ship by is Bulk only: that total ≤ PO line qty + 5% (105%). No PO-qty cap for LCL, FCL, or unset Ship by.
   */
  async updatePoLines(
    shipmentId: string,
    intakeId: string,
    lines: {
      item_id: string;
      received_qty: number;
      bm_percentage?: number | null;
      ppn_percentage?: number | null;
      pph_percentage?: number | null;
    }[]
  ): Promise<ShipmentDetail | null> {
    if (!this.lineReceivedRepo) throw new AppError("Line received repository not available", 500);
    const shipment = await this.repo.findById(shipmentId);
    if (!shipment) return null;
    const isCoupled = await this.mappingRepo.isCoupled(shipmentId, intakeId);
    if (!isCoupled) throw new AppError("PO is not coupled to this shipment", 404);
    const poItems = await poIntakeRepo.findItemsByIntakeId(intakeId);
    const poQtyByItem = new Map(poItems.map((i) => [i.id, i.qty ?? 0]));
    const itemDescriptionById = new Map(
      poItems.map((i) => [i.id, (i.item_description ?? "").trim() || null] as const)
    );
    const shipBy = (shipment.ship_by ?? "").trim();
    if (shipBy === "Bulk") {
      const maxAllowed = 1.05; // 5% over PO qty
      for (const line of lines) {
        const poQty = poQtyByItem.get(line.item_id) ?? 0;
        const totalSoFar = await this.lineReceivedRepo.getTotalReceivedByIntakeItem(intakeId, line.item_id);
        const currentForThisShipment = (await this.lineReceivedRepo.findByShipmentAndIntake(shipmentId, intakeId)).find(
          (l) => l.item_id === line.item_id
        )?.received_qty ?? 0;
        const otherShipmentsTotal = totalSoFar - currentForThisShipment;
        const newTotal = otherShipmentsTotal + line.received_qty;
        if (poQty > 0 && newTotal > poQty * maxAllowed) {
          throw new AppError(
            `Total delivered qty for item ${line.item_id} cannot exceed PO qty by more than 5% (max ${maxAllowed * 100}% of PO qty, PO qty = ${poQty})`,
            400
          );
        }
      }
    }
    await this.lineReceivedRepo.setLines(
      shipmentId,
      intakeId,
      lines.map((line) => ({
        item_id: line.item_id,
        received_qty: line.received_qty,
        item_description: itemDescriptionById.get(line.item_id) ?? null,
        bm_percentage: line.bm_percentage ?? null,
        ppn_percentage: line.ppn_percentage ?? null,
        pph_percentage: line.pph_percentage ?? null,
      }))
    );
    for (const line of lines) {
      await poIntakeRepo.recomputeTotalAmountItemByLine(intakeId, line.item_id);
    }
    await syncPoIntakeStatus(intakeId);
    await this.syncComputedBmToDb(shipmentId);
    return this.getById(shipmentId);
  }
}

