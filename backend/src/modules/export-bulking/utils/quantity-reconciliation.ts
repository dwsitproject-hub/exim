/** Tolerance for MT quantity comparisons (floating-point). */
export const QTY_EPSILON = 1e-6;

export function numbersClose(
  a: number | null | undefined,
  b: number | null | undefined,
  epsilon = QTY_EPSILON,
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < epsilon;
}

export type CargoLineQty = { id: string; quantity?: number | null; cargo_name?: string | null };
export type SiLineQty = { cargo_line_id?: string | null; quantity?: number | null };
export type SiWithLines = { id: string; lines?: SiLineQty[] };
export type InvoiceLineQty = { cargo_line_id?: string | null; quantity?: number | null };
export type InvoiceWithLines = {
  id: string;
  shipping_instruction_id?: string | null;
  lines?: InvoiceLineQty[];
};

function toQty(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return 0;
  return Number(value);
}

/** Sum SI line quantities for one cargo across all shipping instructions. */
export function sumSiQtyForCargo(
  cargoId: string,
  shippingInstructions: SiWithLines[],
  overrideSiId?: string,
  overrideLines?: SiLineQty[],
): number {
  let total = 0;
  for (const si of shippingInstructions) {
    const lines =
      overrideSiId && si.id === overrideSiId && overrideLines !== undefined
        ? overrideLines
        : (si.lines ?? []);
    for (const line of lines) {
      if ((line.cargo_line_id ?? "").trim() === cargoId) {
        total += toQty(line.quantity);
      }
    }
  }
  return total;
}

/** Total quantity on a shipping instruction (sum of its lines). */
export function siTotalQuantity(si: SiWithLines): number {
  return (si.lines ?? []).reduce((sum, l) => sum + toQty(l.quantity), 0);
}

/** Sum invoice line quantities for a shipping instruction across all invoices. */
export function sumInvoiceQtyForSi(
  siId: string,
  invoices: InvoiceWithLines[],
  excludeInvoiceId?: string,
  overrideInvoiceId?: string,
  overrideLines?: InvoiceLineQty[],
): number {
  let total = 0;
  for (const inv of invoices) {
    if (excludeInvoiceId && inv.id === excludeInvoiceId) continue;

    const isOverride =
      overrideInvoiceId != null &&
      inv.id === overrideInvoiceId &&
      overrideLines !== undefined;

    if (isOverride) {
      for (const line of overrideLines) total += toQty(line.quantity);
      continue;
    }

    if ((inv.shipping_instruction_id ?? "").trim() !== siId) continue;

    for (const line of inv.lines ?? []) {
      total += toQty(line.quantity);
    }
  }
  return total;
}

export type QtyReconciliationIssue = { cargoId?: string; cargoName?: string; message: string };

/** Validate that SI allocations per cargo match cargo planned quantities. */
export function validateSiTotalsMatchCargo(
  cargoLines: CargoLineQty[],
  shippingInstructions: SiWithLines[],
  overrideSiId?: string,
  overrideLines?: SiLineQty[],
): QtyReconciliationIssue[] {
  const issues: QtyReconciliationIssue[] = [];
  for (const cargo of cargoLines) {
    const planned = cargo.quantity;
    if (planned == null || Number.isNaN(Number(planned)) || Number(planned) <= 0) continue;
    const allocated = sumSiQtyForCargo(cargo.id, shippingInstructions, overrideSiId, overrideLines);
    if (!numbersClose(allocated, Number(planned))) {
      const name = cargo.cargo_name?.trim() || "Cargo";
      issues.push({
        cargoId: cargo.id,
        cargoName: name,
        message: `${name}: SI total ${allocated} MT does not match cargo qty ${Number(planned)} MT`,
      });
    }
  }
  return issues;
}

/** Draft save: SI allocation per cargo may be partial; block only over-allocation. */
export function validateSiAllocationDoesNotExceedCargo(
  cargoLines: CargoLineQty[],
  shippingInstructions: SiWithLines[],
  overrideSiId?: string,
  overrideLines?: SiLineQty[],
): QtyReconciliationIssue[] {
  const issues: QtyReconciliationIssue[] = [];
  for (const cargo of cargoLines) {
    const planned = cargo.quantity;
    if (planned == null || Number.isNaN(Number(planned)) || Number(planned) <= 0) continue;
    const allocated = sumSiQtyForCargo(cargo.id, shippingInstructions, overrideSiId, overrideLines);
    if (allocated - Number(planned) > QTY_EPSILON) {
      const name = cargo.cargo_name?.trim() || "Cargo";
      issues.push({
        cargoId: cargo.id,
        cargoName: name,
        message: `${name}: SI total ${allocated} MT exceeds cargo qty ${Number(planned)} MT`,
      });
    }
  }
  return issues;
}

/** Draft save: allocated qty for SI must not exceed SI total. */
export function validateInvoiceAllocationDoesNotExceedSi(
  si: SiWithLines,
  invoices: InvoiceWithLines[],
  options?: {
    excludeInvoiceId?: string;
    overrideInvoiceId?: string;
    overrideLines?: InvoiceLineQty[];
    additionalLines?: InvoiceLineQty[];
  },
): QtyReconciliationIssue[] {
  const siId = si.id;
  const expected = siTotalQuantity(si);
  if (expected <= 0) {
    return [{ message: "Shipping instruction has no quantity to invoice" }];
  }
  let invoiced = sumInvoiceQtyForSi(
    siId,
    invoices,
    options?.excludeInvoiceId,
    options?.overrideInvoiceId,
    options?.overrideLines,
  );
  for (const line of options?.additionalLines ?? []) {
    invoiced += toQty(line.quantity);
  }
  if (invoiced - expected > QTY_EPSILON) {
    return [
      {
        message: `Invoice total ${invoiced} MT exceeds SI total ${expected} MT`,
      },
    ];
  }
  return [];
}

/** Validate that invoice totals for an SI match the SI total quantity. */
export function validateInvoiceTotalsMatchSi(
  si: SiWithLines,
  invoices: InvoiceWithLines[],
  options?: {
    excludeInvoiceId?: string;
    overrideInvoiceId?: string;
    overrideLines?: InvoiceLineQty[];
    /** Extra lines from a new invoice not yet persisted. */
    additionalLines?: InvoiceLineQty[];
  },
): QtyReconciliationIssue[] {
  const siId = si.id;
  const expected = siTotalQuantity(si);
  if (expected <= 0) {
    return [{ message: "Shipping instruction has no quantity to invoice" }];
  }
  let invoiced = sumInvoiceQtyForSi(
    siId,
    invoices,
    options?.excludeInvoiceId,
    options?.overrideInvoiceId,
    options?.overrideLines,
  );
  for (const line of options?.additionalLines ?? []) {
    invoiced += toQty(line.quantity);
  }
  if (!numbersClose(invoiced, expected)) {
    return [
      {
        message: `Invoice total ${invoiced} MT does not match SI total ${expected} MT`,
      },
    ];
  }
  return [];
}

export type PackingListLineFromSi = {
  cargo_line_id?: string;
  description_of_goods?: string;
  quantity?: number;
  destination_snapshot?: string;
};

/** Build packing list line payloads from a shipping instruction (qty follows SI). */
export function packingListLinesFromSi(
  si: SiWithLines,
  cargoLines: { id: string; item_description?: string | null; cargo_name?: string | null; destination_port?: string | null; destination_country?: string | null }[],
): PackingListLineFromSi[] {
  const cargoById = new Map(cargoLines.map((c) => [c.id, c]));
  return (si.lines ?? []).map((sl) => {
    const cid = (sl.cargo_line_id ?? "").trim() || null;
    const cargo = cid ? cargoById.get(cid) : undefined;
    const desc =
      cargo?.item_description?.trim() || cargo?.cargo_name?.trim() || null;
    const port = cargo?.destination_port?.trim();
    const country = cargo?.destination_country?.trim();
    let dest: string | null = null;
    if (port && country) dest = `${port} (${country})`;
    else dest = port || country || null;
    const qty = sl.quantity != null ? Number(sl.quantity) : null;
    return {
      ...(cid ? { cargo_line_id: cid } : {}),
      ...(desc ? { description_of_goods: desc } : {}),
      ...(qty != null && !Number.isNaN(qty) ? { quantity: qty } : {}),
      ...(dest ? { destination_snapshot: dest } : {}),
    };
  });
}
