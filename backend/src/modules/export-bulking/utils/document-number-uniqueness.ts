import type { PoolClient } from "pg";
import { AppError } from "../../../middlewares/errorHandler.js";

type DocNumberSpec = {
  table: "export_bulking_shipping_instructions" | "export_bulking_invoices" | "export_bulking_packing_lists";
  column: "si_number" | "invoice_no" | "packing_list_number";
  label: string;
};

export const SI_NUMBER_SPEC: DocNumberSpec = {
  table: "export_bulking_shipping_instructions",
  column: "si_number",
  label: "SI number",
};

export const INVOICE_NUMBER_SPEC: DocNumberSpec = {
  table: "export_bulking_invoices",
  column: "invoice_no",
  label: "Invoice number",
};

export const PACKING_LIST_NUMBER_SPEC: DocNumberSpec = {
  table: "export_bulking_packing_lists",
  column: "packing_list_number",
  label: "Packing list number",
};

export function trimDocNumber(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

/** Reject duplicate document numbers before insert/update (global uniqueness). */
export async function assertUniqueExportDocumentNumber(
  client: PoolClient,
  spec: DocNumberSpec,
  value: string | null | undefined,
  excludeId?: string,
): Promise<void> {
  const trimmed = trimDocNumber(value);
  if (!trimmed) return;

  const r = excludeId
    ? await client.query(
        `SELECT 1 FROM ${spec.table} WHERE btrim(${spec.column}) = $1 AND id <> $2 LIMIT 1`,
        [trimmed, excludeId],
      )
    : await client.query(
        `SELECT 1 FROM ${spec.table} WHERE btrim(${spec.column}) = $1 LIMIT 1`,
        [trimmed],
      );

  if (r.rows.length) {
    throw new AppError(`${spec.label} "${trimmed}" already exists. Use a different number.`, 409);
  }
}

export function isPgUniqueViolation(err: unknown): boolean {
  return (err as { code?: string }).code === "23505";
}

export function rethrowDocumentNumberConflict(err: unknown, label: string): never {
  if (isPgUniqueViolation(err)) {
    throw new AppError(`${label} already exists. Use a different number.`, 409);
  }
  throw err;
}
