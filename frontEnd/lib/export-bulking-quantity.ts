/**
 * Document quantity reconciliation for export bulking (Cargo → SI → Invoice).
 */

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
export type InvoiceLineQty = { quantity?: number | null };
export type InvoiceWithLines = {
  id: string;
  shipping_instruction_id?: string | null;
  lines?: InvoiceLineQty[];
};

function toQty(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return 0;
  return Number(value);
}

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

export function siTotalQuantity(si: SiWithLines): number {
  return (si.lines ?? []).reduce((sum, l) => sum + toQty(l.quantity), 0);
}

export function sumInvoiceQtyForSi(
  siId: string,
  invoices: InvoiceWithLines[],
  excludeInvoiceId?: string,
  overrideInvoiceId?: string,
  overrideLineQtys?: number[],
): number {
  let total = 0;
  for (const inv of invoices) {
    if (excludeInvoiceId && inv.id === excludeInvoiceId) continue;

    const isOverride =
      overrideInvoiceId != null &&
      inv.id === overrideInvoiceId &&
      overrideLineQtys !== undefined;

    if (isOverride) {
      for (const q of overrideLineQtys) total += toQty(q);
      continue;
    }

    if ((inv.shipping_instruction_id ?? "").trim() !== siId) continue;

    for (const line of inv.lines ?? []) {
      total += toQty(line.quantity);
    }
  }
  return total;
}

export type CargoAllocationSummary = {
  cargoId: string;
  cargoName: string;
  planned: number;
  allocated: number;
  remaining: number;
  matched: boolean;
};

export function cargoAllocationSummaries(
  cargoLines: CargoLineQty[],
  shippingInstructions: SiWithLines[],
  overrideSiId?: string,
  overrideLines?: SiLineQty[],
): CargoAllocationSummary[] {
  return cargoLines
    .filter((c) => c.quantity != null && Number(c.quantity) > 0)
    .map((c) => {
      const planned = Number(c.quantity);
      const allocated = sumSiQtyForCargo(c.id, shippingInstructions, overrideSiId, overrideLines);
      return {
        cargoId: c.id,
        cargoName: c.cargo_name?.trim() || "Cargo",
        planned,
        allocated,
        remaining: planned - allocated,
        matched: numbersClose(allocated, planned),
      };
    });
}

export type SiInvoiceSummary = {
  siTotal: number;
  invoiced: number;
  remaining: number;
  matched: boolean;
};

export function siInvoiceSummary(
  si: SiWithLines,
  invoices: InvoiceWithLines[],
  overrideInvoiceId?: string,
  overrideLineQtys?: (number | null)[],
): SiInvoiceSummary {
  const siTotal = siTotalQuantity(si);
  const qtys = overrideLineQtys?.map((q) => q ?? 0);
  const invoiced = sumInvoiceQtyForSi(si.id, invoices, undefined, overrideInvoiceId, qtys);
  return {
    siTotal,
    invoiced,
    remaining: siTotal - invoiced,
    matched: numbersClose(invoiced, siTotal),
  };
}

export function siQtyForCargoLine(si: SiWithLines, cargoLineId: string): number | null {
  const line = (si.lines ?? []).find((l) => (l.cargo_line_id ?? "").trim() === cargoLineId.trim());
  if (!line || line.quantity == null) return null;
  const n = Number(line.quantity);
  return Number.isNaN(n) ? null : n;
}
