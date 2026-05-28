import { AppError } from "../../../middlewares/errorHandler.js";
import { ExportBulkingRepository } from "../repositories/export-bulking.repository.js";
import {
  STATUS_TRANSITIONS,
  type ExportBulkingStatus,
  type CreateExportBulkingShipmentDto,
  type UpdateExportBulkingShipmentDto,
  type ListExportBulkingQuery,
  type ExportBulkingShipmentRow,
  type CargoLineDto,
  type ShippingInstructionDto,
  type InvoiceDto,
  type PackingListDto,
  type PackingListLineDto,
} from "../dto/index.js";
import { getMissingRequirementLabels } from "../utils/export-status-requirements.js";

export class ExportBulkingService {
  constructor(private readonly repo: ExportBulkingRepository) {}

  async create(dto: CreateExportBulkingShipmentDto, userId?: string): Promise<ExportBulkingShipmentRow> {
    const errors: string[] = [];
    if (!dto.vessel_name?.trim()) errors.push("Vessel name is required");
    if (!dto.voyage_number?.trim()) errors.push("Voyage number is required");
    if (!dto.shipper?.trim()) errors.push("Shipper is required");
    if (!dto.loadport_name?.trim()) errors.push("Load port is required");
    if (dto.total_quantity == null || dto.total_quantity <= 0) errors.push("Total quantity must be greater than 0");
    if (errors.length > 0) {
      throw new AppError(errors.join("; "), 400);
    }
    return this.repo.create(dto, userId);
  }

  async list(query: ListExportBulkingQuery): Promise<{ items: ExportBulkingShipmentRow[]; total: number }> {
    const { rows, total } = await this.repo.list(query);
    return { items: rows, total };
  }

  async getById(id: string): Promise<ExportBulkingShipmentRow | null> {
    return this.repo.getById(id);
  }

  async update(id: string, dto: UpdateExportBulkingShipmentDto): Promise<ExportBulkingShipmentRow | null> {
    return this.repo.update(id, dto);
  }

  async updateStatus(id: string, newStatus: string, userId?: string): Promise<ExportBulkingShipmentRow | null> {
    const shipment = await this.repo.getById(id);
    if (!shipment) return null;

    const current = shipment.current_status as ExportBulkingStatus;
    const allowed = STATUS_TRANSITIONS[current];
    if (allowed !== newStatus) {
      throw new Error(
        `Invalid status transition from "${current}" to "${newStatus}". ` +
        (allowed ? `Allowed next status: "${allowed}".` : "This shipment is at a terminal status."),
      );
    }

    const [cargo_lines, shipping_instructions] = await Promise.all([
      this.repo.listCargoLines(id),
      this.repo.listShippingInstructions(id),
    ]);
    const missing = getMissingRequirementLabels({
      current_status: shipment.current_status,
      loadport_name: shipment.loadport_name,
      total_quantity: shipment.total_quantity,
      received_nomination: shipment.received_nomination,
      received_shipping_instruction: shipment.received_shipping_instruction,
      incoterms: shipment.incoterms,
      laycan: shipment.laycan,
      laycan_from: shipment.laycan_from,
      laycan_to: shipment.laycan_to,
      est_cargo_readiness: shipment.est_cargo_readiness,
      est_cargo_readiness_period: shipment.est_cargo_readiness_period,
      eta: shipment.eta,
      ata: shipment.ata,
      etb: shipment.etb,
      atb: shipment.atb,
      commence_loading: shipment.commence_loading,
      etc: shipment.etc,
      atc: shipment.atc,
      td: shipment.td,
      laytime_rate_mtph: shipment.laytime_rate_mtph,
      demurrage_rate_pdpr: shipment.demurrage_rate_pdpr,
      cargo_count: shipment.cargo_count,
      cargo_lines: cargo_lines as { id: string; quantity?: number | null }[],
      shipping_instructions: shipping_instructions as {
        messrs?: string | null;
        bill_of_lading_option?: string | null;
        consignee?: string | null;
        notify_party?: string | null;
        freight?: string | null;
        npwp?: string | null;
        bl_indicated?: string | null;
        lines?: { cargo_line_id?: string | null; bl_split_qty?: number | null }[];
      }[],
    });
    if (missing.length > 0) {
      throw new AppError(`Cannot advance status: ${missing.join(", ")}`, 409);
    }

    return this.repo.updateStatus(id, newStatus, userId, current);
  }

  async softDelete(id: string): Promise<ExportBulkingShipmentRow | null> {
    return this.repo.softDelete(id);
  }

  async getFullDetail(id: string): Promise<{
    shipment: ExportBulkingShipmentRow;
    cargo_lines: unknown[];
    shipping_instructions: unknown[];
    invoices: unknown[];
    packing_lists: unknown[];
  } | null> {
    const shipment = await this.repo.getById(id);
    if (!shipment) return null;

    const [cargo_lines, shipping_instructions, invoices, packing_lists] = await Promise.all([
      this.repo.listCargoLines(id),
      this.repo.listShippingInstructions(id),
      this.repo.listInvoices(id),
      this.repo.listPackingLists(id),
    ]);

    return { shipment, cargo_lines, shipping_instructions, invoices, packing_lists };
  }

  async listFilterOptions(): Promise<Record<string, unknown>> {
    return this.repo.listFilterOptions();
  }

  async getStatusEvents(shipmentId: string): Promise<unknown[]> {
    return this.repo.getStatusEvents(shipmentId);
  }

  /* ───── cargo lines ───── */

  async listCargoLines(shipmentId: string): Promise<unknown[]> {
    return this.repo.listCargoLines(shipmentId);
  }

  async upsertCargoLines(shipmentId: string, lines: CargoLineDto[]): Promise<unknown[]> {
    return this.repo.upsertCargoLines(shipmentId, lines);
  }

  async deleteCargoLine(id: string): Promise<void> {
    return this.repo.deleteCargoLine(id);
  }

  /* ───── shipping instructions ───── */

  async listShippingInstructions(shipmentId: string): Promise<unknown[]> {
    return this.repo.listShippingInstructions(shipmentId);
  }

  async createShippingInstruction(
    shipmentId: string,
    dto: ShippingInstructionDto,
    userId?: string | null,
  ): Promise<unknown> {
    return this.repo.createShippingInstruction(shipmentId, dto, userId);
  }

  async updateShippingInstruction(
    id: string,
    dto: ShippingInstructionDto,
    actingUserId?: string | null,
  ): Promise<unknown> {
    return this.repo.updateShippingInstruction(id, dto, actingUserId);
  }

  async regenerateShippingInstructionNumber(siId: string, userId: string): Promise<unknown | null> {
    return this.repo.regenerateShippingInstructionNumber(siId, userId);
  }

  async deleteShippingInstruction(id: string): Promise<void> {
    return this.repo.deleteShippingInstruction(id);
  }

  /* ───── invoices ───── */

  async listInvoices(shipmentId: string): Promise<unknown[]> {
    return this.repo.listInvoices(shipmentId);
  }

  async createInvoice(shipmentId: string, dto: InvoiceDto, userId?: string | null): Promise<unknown> {
    return this.repo.createInvoice(shipmentId, dto, userId);
  }

  async updateInvoice(id: string, dto: InvoiceDto, actingUserId?: string | null): Promise<unknown> {
    return this.repo.updateInvoice(id, dto, actingUserId);
  }

  async regenerateInvoiceNumber(invoiceId: string, userId: string): Promise<unknown | null> {
    return this.repo.regenerateInvoiceNumber(invoiceId, userId);
  }

  async deleteInvoice(id: string): Promise<void> {
    return this.repo.deleteInvoice(id);
  }

  /* ───── packing lists ───── */

  private async assertPackingListLinesValid(
    shipmentId: string,
    lines: PackingListLineDto[] | undefined,
    excludePackingListId?: string,
  ): Promise<void> {
    if (lines === undefined) return;
    if (lines.length > 1) {
      throw new AppError("A packing list can only have one cargo line", 400);
    }
    if (lines.length === 0) return;

    const cargoId = lines[0].cargo_line_id?.trim();
    if (!cargoId) {
      throw new AppError("Cargo line is required for packing list", 400);
    }

    const cargoLines = (await this.repo.listCargoLines(shipmentId)) as { id: string }[];
    if (!cargoLines.some((c) => c.id === cargoId)) {
      throw new AppError("Cargo line does not belong to this shipment", 400);
    }

    const packingLists = (await this.repo.listPackingLists(shipmentId)) as {
      id: string;
      lines: { cargo_line_id?: string | null }[];
    }[];
    for (const pl of packingLists) {
      if (excludePackingListId && pl.id === excludePackingListId) continue;
      for (const line of pl.lines) {
        if (line.cargo_line_id === cargoId) {
          throw new AppError("This cargo already has a packing list", 400);
        }
      }
    }
  }

  async listPackingLists(shipmentId: string): Promise<unknown[]> {
    return this.repo.listPackingLists(shipmentId);
  }

  async createPackingList(shipmentId: string, dto: PackingListDto, userId?: string | null): Promise<unknown> {
    await this.assertPackingListLinesValid(shipmentId, dto.lines);
    return this.repo.createPackingList(shipmentId, dto, userId);
  }

  async updatePackingList(
    id: string,
    dto: PackingListDto,
    actingUserId?: string | null,
    shipmentId?: string,
  ): Promise<unknown> {
    if (dto.lines !== undefined) {
      if (!shipmentId) {
        throw new AppError("Shipment id is required to update packing list lines", 400);
      }
      await this.assertPackingListLinesValid(shipmentId, dto.lines, id);
    }
    return this.repo.updatePackingList(id, dto, actingUserId);
  }

  async regeneratePackingListNumber(packingListId: string, userId: string): Promise<unknown | null> {
    return this.repo.regeneratePackingListNumber(packingListId, userId);
  }

  async deletePackingList(id: string): Promise<void> {
    return this.repo.deletePackingList(id);
  }
}
