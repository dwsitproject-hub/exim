/**
 * PO intake service: business logic. Store ingested PO, prevent duplicates, track status, assignment.
 */

import { PoIntakeRepository } from "../repositories/po-intake.repository.js";
import { PoIntakeUpdateLogRepository } from "../repositories/po-intake-update-log.repository.js";
import { buildPoIntakeUpdateDiff } from "../utils/po-intake-update-diff.js";
import { ShipmentPoLineReceivedRepository } from "../../shipments/repositories/shipment-po-line-received.repository.js";
import type { LinkedShipmentByIntake } from "../../shipments/repositories/shipment-po-mapping.repository.js";
import type { UserRepository } from "../../auth/repositories/user.repository.js";
import { AppError } from "../../../middlewares/errorHandler.js";
import { syncPoIntakeStatus } from "./po-intake-status-sync.service.js";
import type {
  CreatePoIntakeDto,
  PoCsvImportErrorRow,
  PoCsvImportResult,
  PoImportHistoryRow,
  ListPoIntakeQuery,
  PoListFilterOptions,
  PoIntakeRow,
  PoIntakeItemRow,
  PoIntakeListItem,
  PoIntakeDetail,
  CreatePoIntakeResponse,
  UpdatePoIntakeDto,
} from "../dto/index.js";
import { anyLinkedShipmentBlocksPoEdit } from "../utils/po-intake-shipment-lock.js";
import {
  PO_CSV_ALIASES,
  PO_CSV_CANONICAL_FIELDS,
} from "../../../shared/csv-import-aliases.js";
import { buildPoCsvImportSummary } from "../../../shared/csv-import-summary.js";
import {
  csvCell,
  detectCsvDelimiter,
  parseCsvLine,
  parseInternationalNumber,
  resolveCsvColumnIndices,
  splitCsvTextToDataLines,
  stripBom,
} from "../../../shared/csv-import-utils.js";
import { PO_CSV_TEMPLATE_HINT_LINES } from "../../../shared/shipment-csv-template-hints.js";

type ImportCsvRow = {
  row: number;
  po_number: string;
  supplier_name: string;
  line_number: number;
  qty: number;
  item_description?: string;
  unit?: string;
  unit_price?: number;
  plant?: string;
  pt?: string;
  delivery_location?: string;
  incoterm_location?: string;
  kawasan_berikat?: "Yes" | "No";
  currency?: string;
};

type GroupHeader = {
  supplier_name: string;
  plant?: string;
  pt?: string;
  delivery_location?: string;
  incoterm_location?: string;
  kawasan_berikat?: "Yes" | "No";
  currency?: string;
};

function toListItem(row: PoIntakeRow & { taken_by_name?: string | null }): PoIntakeListItem {
  return {
    id: row.id,
    external_id: row.external_id,
    po_number: row.po_number,
    plant: row.plant,
    pt: row.pt,
    supplier_name: row.supplier_name,
    delivery_location: row.delivery_location,
    incoterm_location: row.incoterm_location,
    kawasan_berikat: row.kawasan_berikat ?? null,
    currency: row.currency ?? null,
    intake_status: row.intake_status,
    taken_by_user_id: row.taken_by_user_id ?? null,
    taken_by_name: row.taken_by_name ?? null,
    taken_at: row.taken_at ? row.taken_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

function normalizeOpt(raw: string): string | undefined {
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

function parseRequiredNumber(raw: string, field: string, row: number, poNumber: string, errors: PoCsvImportErrorRow[]): number | null {
  const t = raw.trim();
  if (!t) {
    errors.push({ row, field, po_number: poNumber, message: `${field} is required` });
    return null;
  }
  const n = parseInternationalNumber(t) ?? Number(t);
  if (!Number.isFinite(n)) {
    errors.push({ row, field, po_number: poNumber, message: `${field} must be a valid number` });
    return null;
  }
  return n;
}

async function generateExternalId(repo: PoIntakeRepository, poNumber: string): Promise<string> {
  const base = `CSV-${poNumber.trim().toUpperCase().replace(/\s+/g, "-")}`;
  let candidate = base;
  let seq = 1;
  while (await repo.existsByExternalId(candidate)) {
    seq += 1;
    candidate = `${base}-${seq}`;
  }
  return candidate;
}

/** node-pg returns DECIMAL/NUMERIC as strings — coerce so JSON clients get real numbers. */
function coercePgNumeric(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const t = value.replace(/,/g, "").trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

async function buildDetail(
  lineReceivedRepo: ShipmentPoLineReceivedRepository,
  row: PoIntakeRow,
  items: PoIntakeItemRow[],
  linkedShipments: LinkedShipmentByIntake[],
  takenByName: string | null,
  overshipped: boolean
): Promise<PoIntakeDetail> {
  const itemsOut = await Promise.all(
    items.map(async (it) => {
      const qtyN = coercePgNumeric(it.qty);
      const qty = qtyN ?? 0;
      const receivedQty = await lineReceivedRepo.getTotalReceivedByIntakeItem(row.id, it.id);
      const remainingQty = Math.max(0, qty - receivedQty);
      const overReceivedPct =
        qty > 0 && receivedQty > qty ? ((receivedQty - qty) / qty) * 100 : null;
      return {
        id: it.id,
        import_purchase_order_id: it.import_purchase_order_id,
        line_number: it.line_number,
        item_description: it.item_description,
        qty: qtyN,
        unit: it.unit,
        value: coercePgNumeric(it.value),
        received_qty: receivedQty,
        remaining_qty: remainingQty,
        over_received_pct: overReceivedPct,
      };
    })
  );

  const linkedShipmentsOut = await Promise.all(
    linkedShipments.map(async (s) => {
      const lineRows = await lineReceivedRepo.findByShipmentAndIntake(s.shipment_id, row.id);
      const byItemId = new Map(lineRows.map((r) => [r.item_id, r.received_qty]));
      const descByItemId = new Map(lineRows.map((r) => [r.item_id, r.item_description]));
      const lines_received = items.map((it) => {
        const stored = descByItemId.get(it.id);
        const desc =
          stored != null && String(stored).trim() !== "" ? stored : it.item_description;
        return {
          item_id: it.id,
          line_number: it.line_number,
          item_description: desc,
          received_qty: byItemId.get(it.id) ?? 0,
        };
      });
      return {
        shipment_id: s.shipment_id,
        shipment_number: s.shipment_number,
        current_status: s.current_status,
        incoterm: s.incoterm ?? null,
        coupled_at: s.coupled_at.toISOString(),
        coupled_by: s.coupled_by,
        atd: s.atd ? s.atd.toISOString() : null,
        ata: s.ata ? s.ata.toISOString() : null,
        delivered_at: s.closed_at ? s.closed_at.toISOString() : null,
        lines_received,
      };
    })
  );

  return {
    id: row.id,
    external_id: row.external_id,
    po_number: row.po_number,
    plant: row.plant,
    pt: row.pt,
    supplier_name: row.supplier_name,
    delivery_location: row.delivery_location,
    incoterm_location: row.incoterm_location,
    kawasan_berikat: row.kawasan_berikat,
    currency: row.currency ?? null,
    intake_status: row.intake_status,
    taken_by_user_id: row.taken_by_user_id,
    taken_by_name: takenByName,
    taken_at: row.taken_at ? row.taken_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    items: itemsOut,
    linked_shipments: linkedShipmentsOut,
    overshipped,
  };
}

export class PoIntakeService {
  private readonly lineReceivedRepo = new ShipmentPoLineReceivedRepository();
  private readonly updateLogRepo = new PoIntakeUpdateLogRepository();

  constructor(
    private readonly repo: PoIntakeRepository,
    private readonly mappingRepo?: { findActiveShipmentsByIntakeId(intakeId: string): Promise<LinkedShipmentByIntake[]> },
    private readonly userRepo?: UserRepository
  ) {}

  /** Create intake (ingestion or test-create). Prevents duplicate by external_id. */
  async create(
    dto: CreatePoIntakeDto,
    options?: { skipDuplicateCheck?: boolean; createdByUserId?: string | null }
  ): Promise<CreatePoIntakeResponse> {
    if (!options?.skipDuplicateCheck) {
      const exists = await this.repo.existsByExternalId(dto.external_id);
      if (exists) {
        throw new AppError("Duplicate PO intake: external_id already exists", 409);
      }
    }
    const dupPo = await this.repo.existsByPoNumberTrimmed(dto.po_number);
    if (dupPo) {
      throw new AppError("Purchase Order number already exists. PO numbers must be unique.", 409);
    }
    const row = await this.repo.create(dto, "NEW_PO_DETECTED", options?.createdByUserId);
    await this.repo.insertItems(row.id, dto.items);
    return {
      id: row.id,
      external_id: row.external_id,
      po_number: row.po_number,
      intake_status: row.intake_status,
      created_at: row.created_at.toISOString(),
    };
  }

  /**
   * Update PO header and lines. Blocked when any linked shipment is Ready Pickup or later.
   * Lines with shipment delivery data cannot be removed.
   */
  async updateIntake(id: string, dto: UpdatePoIntakeDto, changedBy?: string): Promise<PoIntakeDetail | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;

    const beforeItems = await this.repo.findItemsByIntakeId(id);

    const linked = this.mappingRepo ? await this.mappingRepo.findActiveShipmentsByIntakeId(id) : [];
    if (anyLinkedShipmentBlocksPoEdit(linked)) {
      throw new AppError(
        "This Purchase Order cannot be edited while a linked shipment is at Ready Pickup, Picked Up, On Shipment, Customs Clearance, or Delivered.",
        409
      );
    }

    const dupPo = await this.repo.existsByPoNumberTrimmedExcludingId(dto.po_number, id);
    if (dupPo) {
      throw new AppError("Purchase Order number already exists. PO numbers must be unique.", 409);
    }

    const existingIds = await this.repo.listItemIdsForIntake(id);
    const payloadIds = new Set(dto.items.map((it) => it.id).filter((x): x is string => Boolean(x)));

    for (const existingId of existingIds) {
      if (!payloadIds.has(existingId)) {
        const { deleted, blocked } = await this.repo.tryDeleteItemIfNoLineReceived(id, existingId);
        if (blocked) {
          throw new AppError(
            "Cannot remove a line that has shipment delivery quantities recorded.",
            400
          );
        }
        if (!deleted) {
          throw new AppError("Failed to remove PO line", 500);
        }
      }
    }

    await this.repo.updateIntakeHeader(id, dto);

    const idsAfterDeletes = new Set(await this.repo.listItemIdsForIntake(id));
    for (let i = 0; i < dto.items.length; i++) {
      const it = dto.items[i]!;
      const lineNumber = i + 1;
      if (it.id) {
        if (!idsAfterDeletes.has(it.id)) {
          throw new AppError(`Unknown PO line id: ${it.id}`, 400);
        }
        const ok = await this.repo.updateItemRow(
          id,
          it.id,
          lineNumber,
          it.item_description,
          it.qty,
          it.unit,
          it.value
        );
        if (!ok) throw new AppError("Failed to update PO line", 500);
      } else {
        await this.repo.insertSingleItem(id, lineNumber, it.item_description, it.qty, it.unit, it.value);
      }
    }

    await this.repo.recomputeTotalAmountPo(id);
    const { overshipped } = await syncPoIntakeStatus(id);
    const updated = await this.repo.findById(id);
    if (!updated) return null;
    const items = await this.repo.findItemsByIntakeId(id);

    const diff = buildPoIntakeUpdateDiff(row, beforeItems, updated, items);
    if (diff.fieldChanges.length > 0 && changedBy?.trim()) {
      await this.updateLogRepo.create({
        intakeId: id,
        changedBy: changedBy.trim(),
        fieldsChanged: diff.fieldsChanged,
        fieldChanges: diff.fieldChanges,
      });
    }

    const linkedAfter = this.mappingRepo ? await this.mappingRepo.findActiveShipmentsByIntakeId(id) : [];
    const takenByName =
      updated.taken_by_user_id && this.userRepo
        ? (await this.userRepo.findById(updated.taken_by_user_id))?.name ?? null
        : null;
    return buildDetail(this.lineReceivedRepo, updated, items, linkedAfter, takenByName, overshipped);
  }

  getImportTemplateCsv(): string {
    const header = PO_CSV_CANONICAL_FIELDS.join(",");
    const row1 = "PO-0001,PT Supplier A,1,Caustic Soda Flakes,100,MT,1250.5,Plant A,PT EOS,Warehouse Merak,FOB Shanghai,Yes,USD";
    const row2 = "PO-0001,PT Supplier A,2,Soda Ash Dense,50,MT,850,Plant A,PT EOS,Warehouse Merak,FOB Shanghai,Yes,USD";
    const hints = PO_CSV_TEMPLATE_HINT_LINES.join("\n");
    return `${header}\n${row1}\n${row2}\n${hints}\n`;
  }

  async importFromCsv(
    csvText: string,
    actorName: string,
    fileName: string | null,
    createdByUserId?: string | null
  ): Promise<PoCsvImportResult> {
    const lines = splitCsvTextToDataLines(csvText);
    if (lines.length < 2) {
      throw new AppError("CSV must include a header row and at least one data row", 400);
    }

    const delim = detectCsvDelimiter(stripBom(lines[0]!));
    const headerCells = parseCsvLine(stripBom(lines[0]!), delim);
    const { indices, ambiguous } = resolveCsvColumnIndices(headerCells, PO_CSV_CANONICAL_FIELDS, PO_CSV_ALIASES);
    if (ambiguous.length > 0) {
      throw new AppError(
        `Ambiguous CSV column(s) (multiple headers matched the same field): ${[...new Set(ambiguous)].join(", ")}`,
        400
      );
    }
    const missingHeaders = PO_CSV_CANONICAL_FIELDS.filter((k) => indices[k] === undefined);
    if (missingHeaders.length > 0) {
      throw new AppError(
        `Missing required CSV column(s): ${missingHeaders.join(", ")}. ` +
          `You can use alternate header names (e.g. "PO Num" for po_number). ` +
          `Excel often uses ";" as delimiter — that is detected automatically.`,
        400
      );
    }

    const idx = (key: (typeof PO_CSV_CANONICAL_FIELDS)[number]) => indices[key]!;
    const errors: PoCsvImportErrorRow[] = [];
    const rows: ImportCsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const rowNumber = i + 1;
      const cells = parseCsvLine(lines[i]!, delim);
      const poNumber = csvCell(cells, idx("po_number")).trim();
      const supplierName = csvCell(cells, idx("supplier_name")).trim();

      if (!poNumber) {
        errors.push({ row: rowNumber, field: "po_number", po_number: "", message: "po_number is required" });
      }
      if (!supplierName) {
        errors.push({ row: rowNumber, field: "supplier_name", po_number: poNumber, message: "supplier_name is required" });
      }

      const lineNumberRaw = parseRequiredNumber(csvCell(cells, idx("line_number")), "line_number", rowNumber, poNumber, errors);
      const qtyRaw = parseRequiredNumber(csvCell(cells, idx("qty")), "qty", rowNumber, poNumber, errors);
      const unitPriceText = csvCell(cells, idx("unit_price")).trim();
      const unitPriceParsed =
        unitPriceText === "" ? undefined : parseInternationalNumber(unitPriceText) ?? Number(unitPriceText);
      const unitPrice = unitPriceText === "" ? undefined : unitPriceParsed;
      if (unitPriceText !== "" && (!Number.isFinite(unitPrice as number) || (unitPrice as number) < 0)) {
        errors.push({ row: rowNumber, field: "unit_price", po_number: poNumber, message: "unit_price must be a non-negative number" });
      }
      const kawasanText = csvCell(cells, idx("kawasan_berikat")).trim();
      const kawasan = kawasanText === "" ? undefined : (/^yes$/i.test(kawasanText) ? "Yes" : /^no$/i.test(kawasanText) ? "No" : undefined);
      if (kawasanText !== "" && !kawasan) {
        errors.push({
          row: rowNumber,
          field: "kawasan_berikat",
          po_number: poNumber,
          message: "kawasan_berikat must be Yes or No",
        });
      }

      if (lineNumberRaw != null && (!Number.isInteger(lineNumberRaw) || lineNumberRaw < 1)) {
        errors.push({ row: rowNumber, field: "line_number", po_number: poNumber, message: "line_number must be an integer >= 1" });
      }
      if (qtyRaw != null && qtyRaw < 0) {
        errors.push({ row: rowNumber, field: "qty", po_number: poNumber, message: "qty must be a non-negative number" });
      }
      if (!poNumber || !supplierName || lineNumberRaw == null || qtyRaw == null) continue;
      if (!Number.isInteger(lineNumberRaw) || lineNumberRaw < 1 || qtyRaw < 0) continue;

      rows.push({
        row: rowNumber,
        po_number: poNumber,
        supplier_name: supplierName,
        line_number: lineNumberRaw,
        qty: qtyRaw,
        item_description: normalizeOpt(csvCell(cells, idx("item_description"))),
        unit: normalizeOpt(csvCell(cells, idx("unit"))),
        unit_price: unitPrice,
        plant: normalizeOpt(csvCell(cells, idx("plant"))),
        pt: normalizeOpt(csvCell(cells, idx("pt"))),
        delivery_location: normalizeOpt(csvCell(cells, idx("delivery_location"))),
        incoterm_location: normalizeOpt(csvCell(cells, idx("incoterm_location"))),
        kawasan_berikat: kawasan,
        currency: normalizeOpt(csvCell(cells, idx("currency")).toUpperCase()),
      });
    }

    const byPo = new Map<string, ImportCsvRow[]>();
    for (const row of rows) {
      const key = row.po_number.trim().toLowerCase();
      const arr = byPo.get(key) ?? [];
      arr.push(row);
      byPo.set(key, arr);
    }

    let importedPos = 0;
    let importedRows = 0;
    for (const [, poRows] of byPo) {
      const sample = poRows[0]!;
      const duplicatedLine = new Set<number>();
      const seenLine = new Set<number>();
      for (const r of poRows) {
        if (seenLine.has(r.line_number)) duplicatedLine.add(r.line_number);
        seenLine.add(r.line_number);
      }
      if (duplicatedLine.size > 0) {
        for (const r of poRows) {
          if (duplicatedLine.has(r.line_number)) {
            errors.push({
              row: r.row,
              field: "line_number",
              po_number: r.po_number,
              message: `Duplicate line_number ${r.line_number} in the same PO group`,
            });
          }
        }
        continue;
      }

      const headerCheck: GroupHeader = {
        supplier_name: sample.supplier_name,
        plant: sample.plant,
        pt: sample.pt,
        delivery_location: sample.delivery_location,
        incoterm_location: sample.incoterm_location,
        kawasan_berikat: sample.kawasan_berikat,
        currency: sample.currency,
      };
      const inconsistent = poRows.some(
        (r) =>
          r.supplier_name !== headerCheck.supplier_name ||
          (r.plant ?? null) !== (headerCheck.plant ?? null) ||
          (r.pt ?? null) !== (headerCheck.pt ?? null) ||
          (r.delivery_location ?? null) !== (headerCheck.delivery_location ?? null) ||
          (r.incoterm_location ?? null) !== (headerCheck.incoterm_location ?? null) ||
          (r.kawasan_berikat ?? null) !== (headerCheck.kawasan_berikat ?? null) ||
          (r.currency ?? null) !== (headerCheck.currency ?? null)
      );
      if (inconsistent) {
        for (const r of poRows) {
          errors.push({
            row: r.row,
            field: "po_group",
            po_number: r.po_number,
            message: "Rows with the same po_number must share identical header values",
          });
        }
        continue;
      }

      if (await this.repo.existsByPoNumberTrimmed(sample.po_number)) {
        for (const r of poRows) {
          errors.push({
            row: r.row,
            field: "po_number",
            po_number: r.po_number,
            message: "Purchase Order number already exists",
          });
        }
        continue;
      }

      try {
        const externalId = await generateExternalId(this.repo, sample.po_number);
        await this.repo.createWithItemsInTransaction(
          {
            external_id: externalId,
            po_number: sample.po_number,
            supplier_name: sample.supplier_name,
            plant: sample.plant,
            pt: sample.pt,
            delivery_location: sample.delivery_location,
            incoterm_location: sample.incoterm_location,
            kawasan_berikat: sample.kawasan_berikat,
            currency: sample.currency,
            items: poRows.map((r) => ({
              line_number: r.line_number,
              item_description: r.item_description,
              qty: r.qty,
              unit: r.unit,
              value: r.unit_price,
            })),
          },
          "NEW_PO_DETECTED",
          createdByUserId
        );
        importedPos += 1;
        importedRows += poRows.length;
      } catch (e) {
        const message = e instanceof AppError ? e.message : "Failed to import PO";
        for (const r of poRows) {
          errors.push({ row: r.row, field: "po_import", po_number: r.po_number, message });
        }
      }
    }

    const result: PoCsvImportResult = {
      total_rows: lines.length - 1,
      imported_pos: importedPos,
      imported_rows: importedRows,
      failed_rows: (lines.length - 1) - importedRows,
      summary: "",
      errors: errors.sort((a, b) => a.row - b.row),
    };
    result.summary = buildPoCsvImportSummary(result);

    const status = result.imported_rows === 0 ? "FAILED" : result.errors.length > 0 ? "PARTIAL" : "SUCCESS";
    await this.repo.createImportHistory({
      fileName,
      uploadedBy: actorName,
      totalRows: result.total_rows,
      importedPos: result.imported_pos,
      importedRows: result.imported_rows,
      failedRows: result.failed_rows,
      status,
    });

    return result;
  }

  async listImportHistory(limit?: number): Promise<
    Array<{
      id: string;
      file_name: string | null;
      uploaded_by: string;
      total_rows: number;
      imported_pos: number;
      imported_rows: number;
      failed_rows: number;
      status: string;
      created_at: string;
      finished_at: string | null;
    }>
  > {
    const rows: PoImportHistoryRow[] = await this.repo.listImportHistory(limit);
    return rows.map((r) => ({
      id: r.id,
      file_name: r.file_name,
      uploaded_by: r.uploaded_by,
      total_rows: r.total_rows,
      imported_pos: r.imported_pos,
      imported_rows: r.imported_rows,
      failed_rows: r.failed_rows,
      status: r.status,
      created_at: r.created_at.toISOString(),
      finished_at: r.finished_at ? r.finished_at.toISOString() : null,
    }));
  }

  async listFilterOptions(): Promise<PoListFilterOptions> {
    return this.repo.listDistinctFilterOptions();
  }

  async list(query: ListPoIntakeQuery): Promise<{ items: PoIntakeListItem[]; total: number }> {
    const { rows, total } = await this.repo.findAll(query);
    await Promise.all(
      rows.map(async (r) => {
        const { status } = await syncPoIntakeStatus(r.id);
        r.intake_status = status;
      })
    );
    return { items: rows.map(toListItem), total };
  }

  async getById(id: string): Promise<PoIntakeDetail | null> {
    const row = await this.repo.findById(id);
    if (!row) return null;
    const { overshipped } = await syncPoIntakeStatus(id);
    const updated = await this.repo.findById(id);
    if (!updated) return null;
    const items = await this.repo.findItemsByIntakeId(id);
    const linkedShipments = this.mappingRepo ? await this.mappingRepo.findActiveShipmentsByIntakeId(id) : [];
    const takenByName =
      updated.taken_by_user_id && this.userRepo
        ? (await this.userRepo.findById(updated.taken_by_user_id))?.name ?? null
        : null;
    return buildDetail(this.lineReceivedRepo, updated, items, linkedShipments, takenByName, overshipped);
  }

  async takeOwnership(id: string, userId: string): Promise<PoIntakeDetail | null> {
    const row = await this.repo.findById(id);
    if (!row) throw new AppError("PO intake not found", 404);

    if (row.intake_status !== "NEW_PO_DETECTED") {
      const linkedShipments = this.mappingRepo ? await this.mappingRepo.findActiveShipmentsByIntakeId(id) : [];
      const allDelivered =
        linkedShipments.length > 0 &&
        linkedShipments.every((s) => s.current_status === "DELIVERED");
      const items = await this.repo.findItemsByIntakeId(id);
      let totalReceived = 0;
      let totalPoQty = 0;
      for (const it of items) {
        totalPoQty += it.qty ?? 0;
        totalReceived += await this.lineReceivedRepo.getTotalReceivedByIntakeItem(id, it.id);
      }
      const hasRemaining = totalPoQty > 0 && totalReceived < totalPoQty;
      if (!allDelivered || !hasRemaining) {
        throw new AppError("PO intake not available for claim", 409);
      }
    }

    const updated = await this.repo.takeOwnership(id, userId);
    if (!updated) return null;
    const { overshipped } = await syncPoIntakeStatus(id);
    const rowAfter = await this.repo.findById(id);
    if (!rowAfter) return null;
    const items = await this.repo.findItemsByIntakeId(id);
    const linkedShipments = this.mappingRepo ? await this.mappingRepo.findActiveShipmentsByIntakeId(id) : [];
    const takenByName =
      rowAfter.taken_by_user_id && this.userRepo
        ? (await this.userRepo.findById(rowAfter.taken_by_user_id))?.name ?? null
        : null;
    return buildDetail(this.lineReceivedRepo, rowAfter, items, linkedShipments, takenByName, overshipped);
  }
}
