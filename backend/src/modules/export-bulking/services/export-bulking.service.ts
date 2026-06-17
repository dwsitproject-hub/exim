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
import {
  validateSiTotalsMatchCargo,
  validateInvoiceTotalsMatchSi,
  packingListLinesFromSi,
  type CargoLineQty,
  type SiWithLines,
  type InvoiceWithLines,
} from "../utils/quantity-reconciliation.js";
import { syncExportSentDocumentNotifications } from "./export-sent-doc-notifications.js";

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
    const updated = await this.repo.update(id, dto);
    if (updated) {
      await syncExportSentDocumentNotifications(updated);
    }
    return updated;
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

  async listDocumentationAssignees(): Promise<{ id: string; name: string; email: string }[]> {
    return this.repo.listDocumentationAssignees();
  }

  async assignDocumentation(
    shipmentId: string,
    assigneeUserId: string | null,
    assignedByUserId: string,
  ): Promise<ExportBulkingShipmentRow | null> {
    const existing = await this.repo.getById(shipmentId);
    if (!existing) return null;
    return this.repo.assignDocumentation(shipmentId, assigneeUserId, assignedByUserId);
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

  private async assertSiQuantityReconciliation(
    shipmentId: string,
    shippingInstructions: SiWithLines[],
    options?: { overrideSiId?: string; overrideLines?: ShippingInstructionDto["lines"] },
  ): Promise<void> {
    const cargoLines = (await this.repo.listCargoLines(shipmentId)) as CargoLineQty[];
    const issues = validateSiTotalsMatchCargo(
      cargoLines,
      shippingInstructions,
      options?.overrideSiId,
      options?.overrideLines,
    );
    if (issues.length > 0) {
      throw new AppError(issues.map((i) => i.message).join("; "), 400);
    }
  }

  async createShippingInstruction(
    shipmentId: string,
    dto: ShippingInstructionDto,
    userId?: string | null,
  ): Promise<unknown> {
    if (dto.lines !== undefined) {
      const existing = (await this.repo.listShippingInstructions(shipmentId)) as SiWithLines[];
      await this.assertSiQuantityReconciliation(shipmentId, [
        ...existing,
        { id: "__pending__", lines: dto.lines },
      ]);
    }
    return this.repo.createShippingInstruction(shipmentId, dto, userId);
  }

  async updateShippingInstruction(
    id: string,
    dto: ShippingInstructionDto,
    actingUserId?: string | null,
  ): Promise<unknown> {
    if (dto.lines !== undefined) {
      const shipmentId = await this.repo.getShippingInstructionShipmentId(id);
      if (!shipmentId) throw new AppError("Shipping instruction not found", 404);
      const existing = (await this.repo.listShippingInstructions(shipmentId)) as SiWithLines[];
      await this.assertSiQuantityReconciliation(shipmentId, existing, {
        overrideSiId: id,
        overrideLines: dto.lines,
      });
    }
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

  private async assertInvoiceQuantityReconciliation(
    shipmentId: string,
    siId: string,
    invoices: InvoiceWithLines[],
    options?: {
      overrideInvoiceId?: string;
      overrideLines?: InvoiceDto["lines"];
      additionalLines?: InvoiceDto["lines"];
    },
  ): Promise<void> {
    const shippingInstructions = (await this.repo.listShippingInstructions(shipmentId)) as SiWithLines[];
    const si = shippingInstructions.find((s) => s.id === siId);
    if (!si) throw new AppError("Shipping instruction not found for this shipment", 400);
    const issues = validateInvoiceTotalsMatchSi(si, invoices, {
      overrideInvoiceId: options?.overrideInvoiceId,
      overrideLines: options?.overrideLines,
      additionalLines: options?.additionalLines,
    });
    if (issues.length > 0) {
      throw new AppError(issues.map((i) => i.message).join("; "), 400);
    }
  }

  async createInvoice(shipmentId: string, dto: InvoiceDto, userId?: string | null): Promise<unknown> {
    const siId = (dto.shipping_instruction_id ?? "").trim();
    if (siId && dto.lines?.length) {
      const invoices = (await this.repo.listInvoices(shipmentId)) as InvoiceWithLines[];
      await this.assertInvoiceQuantityReconciliation(shipmentId, siId, invoices, {
        additionalLines: dto.lines,
      });
    }
    return this.repo.createInvoice(shipmentId, dto, userId);
  }

  async updateInvoice(id: string, dto: InvoiceDto, actingUserId?: string | null): Promise<unknown> {
    if (dto.lines !== undefined) {
      const cur = await this.repo.getInvoiceHeader(id);
      if (!cur) throw new AppError("Invoice not found", 404);
      const siId = (
        dto.shipping_instruction_id !== undefined
          ? dto.shipping_instruction_id
          : cur.shipping_instruction_id
      )?.trim();
      if (siId) {
        const invoices = (await this.repo.listInvoices(cur.shipment_id)) as InvoiceWithLines[];
        await this.assertInvoiceQuantityReconciliation(cur.shipment_id, siId, invoices, {
          overrideInvoiceId: id,
          overrideLines: dto.lines,
        });
      }
    }
    return this.repo.updateInvoice(id, dto, actingUserId);
  }

  async regenerateInvoiceNumber(invoiceId: string, userId: string): Promise<unknown | null> {
    return this.repo.regenerateInvoiceNumber(invoiceId, userId);
  }

  async deleteInvoice(id: string): Promise<void> {
    return this.repo.deleteInvoice(id);
  }

  /* ───── packing lists ───── */

  private async assertPackingListSiValid(
    shipmentId: string,
    siId: string | null | undefined,
    excludePackingListId?: string,
  ): Promise<void> {
    const trimmed = (siId ?? "").trim();
    if (!trimmed) {
      throw new AppError("Shipping instruction is required for packing list", 400);
    }
    const shippingInstructions = (await this.repo.listShippingInstructions(shipmentId)) as SiWithLines[];
    if (!shippingInstructions.some((s) => s.id === trimmed)) {
      throw new AppError("Shipping instruction does not belong to this shipment", 400);
    }
    const packingLists = (await this.repo.listPackingLists(shipmentId)) as {
      id: string;
      shipping_instruction_id?: string | null;
    }[];
    for (const pl of packingLists) {
      if (excludePackingListId && pl.id === excludePackingListId) continue;
      if ((pl.shipping_instruction_id ?? "").trim() === trimmed) {
        throw new AppError("This shipping instruction already has a packing list", 400);
      }
    }
  }

  private async enrichPackingListFromSi(
    shipmentId: string,
    dto: PackingListDto,
  ): Promise<PackingListDto> {
    const siId = (dto.shipping_instruction_id ?? "").trim();
    if (!siId) return dto;
    const [shippingInstructions, cargoLines] = await Promise.all([
      this.repo.listShippingInstructions(shipmentId) as Promise<SiWithLines[]>,
      this.repo.listCargoLines(shipmentId) as Promise<
        { id: string; item_description?: string | null; cargo_name?: string | null; destination_port?: string | null; destination_country?: string | null }[]
      >,
    ]);
    const si = shippingInstructions.find((s) => s.id === siId);
    if (!si) throw new AppError("Shipping instruction not found", 400);
    const derived = packingListLinesFromSi(si, cargoLines);
    const packingByCargo = new Map(
      (dto.lines ?? []).map((l) => [(l.cargo_line_id ?? "").trim(), l.packing ?? null]),
    );
    return {
      ...dto,
      lines: derived.map((line) => ({
        ...line,
        packing: packingByCargo.get((line.cargo_line_id ?? "").trim()) ?? undefined,
      })),
    };
  }

  async listPackingLists(shipmentId: string): Promise<unknown[]> {
    return this.repo.listPackingLists(shipmentId);
  }

  async createPackingList(shipmentId: string, dto: PackingListDto, userId?: string | null): Promise<unknown> {
    await this.assertPackingListSiValid(shipmentId, dto.shipping_instruction_id);
    const enriched = await this.enrichPackingListFromSi(shipmentId, dto);
    return this.repo.createPackingList(shipmentId, enriched, userId);
  }

  async updatePackingList(
    id: string,
    dto: PackingListDto,
    actingUserId?: string | null,
    shipmentId?: string,
  ): Promise<unknown> {
    const resolvedShipmentId = shipmentId ?? (await this.repo.getPackingListShipmentId(id));
    if (!resolvedShipmentId) throw new AppError("Packing list not found", 404);
    if (dto.shipping_instruction_id !== undefined) {
      await this.assertPackingListSiValid(resolvedShipmentId, dto.shipping_instruction_id, id);
    }
    const siId = (dto.shipping_instruction_id ?? "").trim();
    const body = siId ? await this.enrichPackingListFromSi(resolvedShipmentId, dto) : dto;
    return this.repo.updatePackingList(id, body, actingUserId);
  }

  async regeneratePackingListNumber(packingListId: string, userId: string): Promise<unknown | null> {
    return this.repo.regeneratePackingListNumber(packingListId, userId);
  }

  async deletePackingList(id: string): Promise<void> {
    return this.repo.deletePackingList(id);
  }
}
