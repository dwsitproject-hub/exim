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
  type SapLineDto,
  type BillingLineDto,
  type BillOfLadingDto,
  type SiPebFieldsDto,
  type ShippingInstructionDto,
  type InvoiceDto,
  type PackingListDto,
  type PackingListLineDto,
} from "../dto/index.js";
import { getMissingRequirementLabels } from "../utils/export-status-requirements.js";
import {
  validateSiAllocationDoesNotExceedCargo,
  validateInvoiceTotalsMatchSi,
  validateInvoiceAllocationDoesNotExceedSi,
  siTotalQuantity,
  sumInvoiceQtyForSi,
  packingListLinesFromSi,
  type CargoLineQty,
  type SiWithLines,
  type InvoiceWithLines,
} from "../utils/quantity-reconciliation.js";
import {
  buildInvoiceSnapshot,
  computeInvoiceDiff,
} from "../utils/invoice-snapshot.js";
import {
  invoiceRecordToSnapshot,
  parseSplitQuantities,
  recordInvoiceSaveAudit,
  type InvoiceRecord,
} from "./invoice-workflow.helpers.js";
import type { InvoiceSplitDto, InvoiceAmendDto, InvoiceFinalizeDto } from "../dto/index.js";
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
    sap_lines: unknown[];
    billing_lines: unknown[];
    bills_of_lading: unknown[];
  } | null> {
    const shipment = await this.repo.getById(id);
    if (!shipment) return null;

    const [cargo_lines, shipping_instructions, invoices, packing_lists, sap_lines, billing_lines, bills_of_lading] =
      await Promise.all([
      this.repo.listCargoLines(id),
      this.repo.listShippingInstructions(id),
      this.repo.listInvoices(id),
      this.repo.listPackingLists(id),
      this.repo.listSapLines(id),
      this.repo.listBillingLines(id),
      this.repo.listBillsOfLading(id),
    ]);

    return { shipment, cargo_lines, shipping_instructions, invoices, packing_lists, sap_lines, billing_lines, bills_of_lading };
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

  async deleteCargoLine(shipmentId: string, cargoId: string): Promise<void> {
    return this.repo.deleteCargoLine(shipmentId, cargoId);
  }

  /* ───── SAP lines ───── */

  async listSapLines(shipmentId: string): Promise<unknown[]> {
    return this.repo.listSapLines(shipmentId);
  }

  async upsertSapLines(shipmentId: string, lines: SapLineDto[]): Promise<unknown[]> {
    return this.repo.upsertSapLines(shipmentId, lines);
  }

  /* ───── Billing lines ───── */

  async listBillingLines(shipmentId: string): Promise<unknown[]> {
    return this.repo.listBillingLines(shipmentId);
  }

  async upsertBillingLines(shipmentId: string, lines: BillingLineDto[]): Promise<unknown[]> {
    return this.repo.upsertBillingLines(shipmentId, lines);
  }

  /* ───── Bills of lading ───── */

  async listBillsOfLading(shipmentId: string): Promise<unknown[]> {
    return this.repo.listBillsOfLading(shipmentId);
  }

  async upsertBillsOfLading(shipmentId: string, lines: BillOfLadingDto[]): Promise<unknown[]> {
    return this.repo.upsertBillsOfLading(shipmentId, lines);
  }

  async upsertSiPebFields(shipmentId: string, items: SiPebFieldsDto[]): Promise<unknown[]> {
    if (!items.length) return this.repo.listShippingInstructions(shipmentId);
    return this.repo.upsertSiPebFields(shipmentId, items);
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
    const issues = validateSiAllocationDoesNotExceedCargo(
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
    shipmentId: string,
    id: string,
    dto: ShippingInstructionDto,
    actingUserId?: string | null,
  ): Promise<unknown> {
    if (dto.lines !== undefined) {
      const existingShipmentId = await this.repo.getShippingInstructionShipmentId(id);
      if (!existingShipmentId) throw new AppError("Shipping instruction not found", 404);
      if (existingShipmentId !== shipmentId) throw new AppError("Shipping instruction not found", 404);
      const existing = (await this.repo.listShippingInstructions(shipmentId)) as SiWithLines[];
      await this.assertSiQuantityReconciliation(shipmentId, existing, {
        overrideSiId: id,
        overrideLines: dto.lines,
      });
    }
    return this.repo.updateShippingInstruction(shipmentId, id, dto, actingUserId);
  }

  async regenerateShippingInstructionNumber(
    shipmentId: string,
    siId: string,
    userId: string,
  ): Promise<unknown | null> {
    const ownerShipmentId = await this.repo.getShippingInstructionShipmentId(siId);
    if (!ownerShipmentId || ownerShipmentId !== shipmentId) {
      throw new AppError("Shipping instruction not found", 404);
    }
    return this.repo.regenerateShippingInstructionNumber(siId, userId);
  }

  async deleteShippingInstruction(shipmentId: string, id: string): Promise<void> {
    return this.repo.deleteShippingInstruction(shipmentId, id);
  }

  /* ───── invoices ───── */

  async listInvoices(shipmentId: string): Promise<unknown[]> {
    return this.repo.listInvoices(shipmentId);
  }

  private async assertInvoiceDraftAllocation(
    shipmentId: string,
    siId: string,
    invoices: InvoiceWithLines[],
    options?: {
      excludeInvoiceId?: string;
      overrideInvoiceId?: string;
      overrideLines?: InvoiceDto["lines"];
      additionalLines?: InvoiceDto["lines"];
    },
  ): Promise<void> {
    const shippingInstructions = (await this.repo.listShippingInstructions(shipmentId)) as SiWithLines[];
    const si = shippingInstructions.find((s) => s.id === siId);
    if (!si) throw new AppError("Shipping instruction not found for this shipment", 400);
    const issues = validateInvoiceAllocationDoesNotExceedSi(si, invoices, {
      overrideInvoiceId: options?.overrideInvoiceId,
      overrideLines: options?.overrideLines,
      additionalLines: options?.additionalLines,
    });
    if (issues.length > 0) {
      throw new AppError(issues.map((i) => i.message).join("; "), 400);
    }
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
      await this.assertInvoiceDraftAllocation(shipmentId, siId, invoices, {
        additionalLines: dto.lines,
      });
    }
    const created = (await this.repo.createInvoice(shipmentId, dto, userId)) as Record<string, unknown>;
    const full = (await this.repo.getInvoiceById(String(created.id)))!;
    await recordInvoiceSaveAudit(this.repo, {
      before: { id: String(created.id), lines: [], draft_snapshot: null },
      after: full as InvoiceRecord,
      userId,
    });
    return full;
  }

  async updateInvoice(
    shipmentId: string,
    id: string,
    dto: InvoiceDto,
    actingUserId?: string | null,
  ): Promise<unknown> {
    const before = await this.repo.getInvoiceById(id);
    if (!before) throw new AppError("Invoice not found", 404);
    if (before.shipment_id !== shipmentId) throw new AppError("Invoice not found", 404);
    if (String(before.status ?? "DRAFT") === "FINAL") {
      throw new AppError("Finalized invoices cannot be edited. Use Amend to reopen.", 409);
    }

    if (dto.lines !== undefined) {
      const siId = String(
        dto.shipping_instruction_id !== undefined
          ? dto.shipping_instruction_id
          : before.shipping_instruction_id ?? "",
      ).trim();
      if (siId) {
        const invoices = (await this.repo.listInvoices(shipmentId)) as InvoiceWithLines[];
        await this.assertInvoiceDraftAllocation(shipmentId, siId, invoices, {
          overrideInvoiceId: id,
          overrideLines: dto.lines,
        });
      }
    }

    const updated = await this.repo.updateInvoice(shipmentId, id, dto, actingUserId);
    if (!updated) throw new AppError("Invoice not found", 404);
    const after = (await this.repo.getInvoiceById(id))!;
    await recordInvoiceSaveAudit(this.repo, {
      before: before as InvoiceRecord,
      after: after as InvoiceRecord,
      userId: actingUserId,
      reason: dto.qty_change_reason ?? null,
    });
    return after;
  }

  async splitInvoices(
    shipmentId: string,
    siId: string,
    dto: InvoiceSplitDto,
    userId?: string | null,
  ): Promise<unknown[]> {
    const shippingInstructions = (await this.repo.listShippingInstructions(shipmentId)) as SiWithLines[];
    const si = shippingInstructions.find((s) => s.id === siId);
    if (!si) throw new AppError("Shipping instruction not found", 404);

    const siTotal = siTotalQuantity(si);
    let quantities: number[];
    try {
      quantities = parseSplitQuantities(siTotal, dto.mode, dto.count, dto.quantities);
    } catch (e) {
      throw new AppError(e instanceof Error ? e.message : "Invalid split quantities", 400);
    }

    const sum = quantities.reduce((a, b) => a + b, 0);
    if (siTotal > 0 && Math.abs(sum - siTotal) > 1e-6) {
      throw new AppError(
        `Split quantities (${sum} MT) must equal SI total (${siTotal} MT)`,
        400,
      );
    }

    const invoices = (await this.repo.listInvoices(shipmentId)) as InvoiceWithLines[];
    const existing = sumInvoiceQtyForSi(siId, invoices);
    if (existing + sum > siTotal + 1e-6) {
      throw new AppError(
        `Split would exceed SI total (${siTotal} MT). Already invoiced: ${existing} MT`,
        400,
      );
    }

    const cargoLineId = (dto.cargo_line_id ?? "").trim() || null;
    const created = await this.repo.splitInvoicesForSi(
      shipmentId,
      siId,
      quantities,
      cargoLineId,
      userId,
    );

    for (const inv of created) {
      const row = inv as { id: string };
      await this.repo.insertInvoiceEvent({
        invoiceId: row.id,
        eventType: "CREATED",
        fromStatus: null,
        toStatus: "DRAFT",
        changes: [{ field: "Split invoice", oldValue: null, newValue: `${quantities.length} invoices` }],
        changedBy: userId ?? null,
      });
    }

    return (await Promise.all(
      created.map(async (inv) => this.repo.getInvoiceById((inv as { id: string }).id)),
    )).filter(Boolean);
  }

  async finalizeInvoice(
    shipmentId: string,
    invoiceId: string,
    dto: InvoiceFinalizeDto,
    userId: string,
  ): Promise<unknown> {
    const before = await this.repo.getInvoiceById(invoiceId);
    if (!before || before.shipment_id !== shipmentId) throw new AppError("Invoice not found", 404);
    if (String(before.status ?? "DRAFT") !== "DRAFT") {
      throw new AppError("Only draft invoices can be finalized", 409);
    }

    const siId = String(before.shipping_instruction_id ?? "").trim();
    if (siId) {
      const invoices = (await this.repo.listInvoices(shipmentId)) as InvoiceWithLines[];
      await this.assertInvoiceQuantityReconciliation(shipmentId, siId, invoices, {
        overrideInvoiceId: invoiceId,
        overrideLines: (before.lines as InvoiceDto["lines"]) ?? [],
      });
    }

    if (!String(before.invoice_no ?? "").trim()) {
      throw new AppError("Invoice number is required before finalizing", 400);
    }
    const lines = (before.lines as Array<{ quantity?: number | null }>) ?? [];
    if (lines.length === 0 || lines.every((l) => l.quantity == null || Number(l.quantity) <= 0)) {
      throw new AppError("At least one invoice line with quantity is required", 400);
    }

    const draftBaseline =
      (before.draft_snapshot as ReturnType<typeof buildInvoiceSnapshot> | null) ??
      invoiceRecordToSnapshot(before as InvoiceRecord);
    const finalSnap = invoiceRecordToSnapshot(before as InvoiceRecord);
    const finalizeDiff = computeInvoiceDiff(draftBaseline, finalSnap);

    const updated = await this.repo.finalizeInvoiceRecord(invoiceId, {
      draftSnapshot: draftBaseline,
      finalSnapshot: finalSnap,
      userId,
    });
    if (!updated) throw new AppError("Invoice could not be finalized", 409);

    await this.repo.insertInvoiceEvent({
      invoiceId,
      eventType: "FINALIZED",
      fromStatus: "DRAFT",
      toStatus: "FINAL",
      changes: finalizeDiff,
      reason: dto.note ?? null,
      changedBy: userId,
    });

    return this.repo.getInvoiceById(invoiceId);
  }

  async amendInvoice(
    shipmentId: string,
    invoiceId: string,
    dto: InvoiceAmendDto,
    userId: string,
  ): Promise<unknown> {
    const before = await this.repo.getInvoiceById(invoiceId);
    if (!before || before.shipment_id !== shipmentId) throw new AppError("Invoice not found", 404);
    if (String(before.status ?? "") !== "FINAL") {
      throw new AppError("Only finalized invoices can be amended", 409);
    }
    const reason = dto.reason?.trim();
    if (!reason) throw new AppError("Amend reason is required", 400);

    const updated = await this.repo.amendInvoiceRecord(invoiceId, userId, reason);
    if (!updated) throw new AppError("Invoice could not be amended", 409);
    return this.repo.getInvoiceById(invoiceId);
  }

  async listInvoiceEvents(shipmentId: string, invoiceId: string): Promise<unknown[]> {
    const header = await this.repo.getInvoiceHeader(invoiceId);
    if (!header || header.shipment_id !== shipmentId) throw new AppError("Invoice not found", 404);
    return this.repo.listInvoiceEvents(invoiceId);
  }

  async getInvoiceFinalizeDiff(shipmentId: string, invoiceId: string): Promise<unknown> {
    const inv = await this.repo.getInvoiceById(invoiceId);
    if (!inv || inv.shipment_id !== shipmentId) throw new AppError("Invoice not found", 404);

    const draftSnap =
      (inv.draft_snapshot as ReturnType<typeof buildInvoiceSnapshot> | null) ??
      invoiceRecordToSnapshot(inv as InvoiceRecord);
    const finalSnap =
      (inv.final_snapshot as ReturnType<typeof buildInvoiceSnapshot> | null) ??
      (String(inv.status) === "FINAL" ? invoiceRecordToSnapshot(inv as InvoiceRecord) : null);

    if (!finalSnap) {
      return {
        status: inv.status,
        changes: computeInvoiceDiff(draftSnap, invoiceRecordToSnapshot(inv as InvoiceRecord)),
        draft_snapshot: draftSnap,
        final_snapshot: null,
      };
    }

    return {
      status: inv.status,
      changes: computeInvoiceDiff(draftSnap, finalSnap),
      draft_snapshot: draftSnap,
      final_snapshot: finalSnap,
      finalized_at: inv.finalized_at,
    };
  }

  async getSiInvoiceAllocation(shipmentId: string, siId: string): Promise<unknown> {
    const shippingInstructions = (await this.repo.listShippingInstructions(shipmentId)) as SiWithLines[];
    const si = shippingInstructions.find((s) => s.id === siId);
    if (!si) throw new AppError("Shipping instruction not found", 404);
    const invoices = (await this.repo.listInvoices(shipmentId)) as InvoiceWithLines[];
    const linked = invoices.filter((inv) => (inv.shipping_instruction_id ?? "").trim() === siId);
    const siTotal = siTotalQuantity(si);
    const invoiced = linked.reduce((sum, inv) => {
      return sum + (inv.lines ?? []).reduce((s, l) => s + Number(l.quantity ?? 0), 0);
    }, 0);
    return {
      si_id: siId,
      si_total: siTotal,
      invoiced,
      remaining: siTotal - invoiced,
      matched: Math.abs(invoiced - siTotal) < 1e-6,
      invoices: linked.map((inv) => ({
        id: inv.id,
        status: (inv as { status?: string }).status ?? "DRAFT",
        invoice_no: (inv as { invoice_no?: string }).invoice_no ?? null,
        quantity: (inv.lines ?? []).reduce((s, l) => s + Number(l.quantity ?? 0), 0),
      })),
    };
  }

  async regenerateInvoiceNumber(
    shipmentId: string,
    invoiceId: string,
    userId: string,
  ): Promise<unknown | null> {
    const header = await this.repo.getInvoiceHeader(invoiceId);
    if (!header || header.shipment_id !== shipmentId) {
      throw new AppError("Invoice not found", 404);
    }
    return this.repo.regenerateInvoiceNumber(invoiceId, userId);
  }

  async deleteInvoice(shipmentId: string, id: string): Promise<void> {
    return this.repo.deleteInvoice(shipmentId, id);
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
    shipmentId: string,
    id: string,
    dto: PackingListDto,
    actingUserId?: string | null,
  ): Promise<unknown> {
    if (dto.shipping_instruction_id !== undefined) {
      await this.assertPackingListSiValid(shipmentId, dto.shipping_instruction_id, id);
    }
    const siId = (dto.shipping_instruction_id ?? "").trim();
    const body = siId ? await this.enrichPackingListFromSi(shipmentId, dto) : dto;
    return this.repo.updatePackingList(shipmentId, id, body, actingUserId);
  }

  async regeneratePackingListNumber(
    shipmentId: string,
    packingListId: string,
    userId: string,
  ): Promise<unknown | null> {
    const ownerShipmentId = await this.repo.getPackingListShipmentId(packingListId);
    if (!ownerShipmentId || ownerShipmentId !== shipmentId) {
      throw new AppError("Packing list not found", 404);
    }
    return this.repo.regeneratePackingListNumber(packingListId, userId);
  }

  async deletePackingList(shipmentId: string, id: string): Promise<void> {
    return this.repo.deletePackingList(shipmentId, id);
  }
}
