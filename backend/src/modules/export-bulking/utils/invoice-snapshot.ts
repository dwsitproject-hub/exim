/** Invoice snapshot capture and draft→final diff for export bulking. */

export type InvoiceSnapshotLine = {
  cargo_line_id?: string | null;
  item_no?: number | null;
  description_of_goods?: string | null;
  contract_no?: string | null;
  so_no?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total_amount?: number | null;
};

export type InvoiceSnapshot = {
  invoice_no?: string | null;
  invoice_date?: string | null;
  messrs?: string | null;
  vessel_voyage_snapshot?: string | null;
  loadport_snapshot?: string | null;
  destination_snapshot?: string | null;
  marks?: string | null;
  shipping_instruction_id?: string | null;
  lines: InvoiceSnapshotLine[];
};

export type InvoiceFieldChange = {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  lineKey?: string;
};

function normStr(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function normNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function fmtNum(v: number | null | undefined): string | null {
  if (v == null || Number.isNaN(Number(v))) return null;
  return String(v);
}

function lineKey(line: InvoiceSnapshotLine, index: number): string {
  const cargo = (line.cargo_line_id ?? "").trim();
  const so = (line.so_no ?? "").trim();
  if (cargo || so) return `${cargo}|${so}|${line.item_no ?? index + 1}`;
  return `line-${index + 1}`;
}

export function buildInvoiceSnapshot(input: {
  invoice_no?: unknown;
  invoice_date?: unknown;
  messrs?: unknown;
  vessel_voyage_snapshot?: unknown;
  loadport_snapshot?: unknown;
  destination_snapshot?: unknown;
  marks?: unknown;
  shipping_instruction_id?: unknown;
  lines?: Array<Record<string, unknown>>;
}): InvoiceSnapshot {
  return {
    invoice_no: normStr(input.invoice_no),
    invoice_date: normStr(input.invoice_date),
    messrs: normStr(input.messrs),
    vessel_voyage_snapshot: normStr(input.vessel_voyage_snapshot),
    loadport_snapshot: normStr(input.loadport_snapshot),
    destination_snapshot: normStr(input.destination_snapshot),
    marks: normStr(input.marks),
    shipping_instruction_id: normStr(input.shipping_instruction_id),
    lines: (input.lines ?? []).map((l) => ({
      cargo_line_id: normStr(l.cargo_line_id),
      item_no: l.item_no != null ? Number(l.item_no) : null,
      description_of_goods: normStr(l.description_of_goods),
      contract_no: normStr(l.contract_no),
      so_no: normStr(l.so_no),
      quantity: normNum(l.quantity),
      unit_price: normNum(l.unit_price),
      total_amount: normNum(l.total_amount),
    })),
  };
}

const HEADER_FIELDS: Array<{ key: keyof InvoiceSnapshot; label: string }> = [
  { key: "invoice_no", label: "Invoice No" },
  { key: "invoice_date", label: "Invoice Date" },
  { key: "messrs", label: "Messrs" },
  { key: "vessel_voyage_snapshot", label: "Vessel / Voyage" },
  { key: "loadport_snapshot", label: "Load Port" },
  { key: "destination_snapshot", label: "Destination" },
  { key: "marks", label: "Marks" },
  { key: "shipping_instruction_id", label: "Shipping Instruction" },
];

export function computeInvoiceDiff(
  before: InvoiceSnapshot | null | undefined,
  after: InvoiceSnapshot | null | undefined,
): InvoiceFieldChange[] {
  const prev = before ?? { lines: [] };
  const next = after ?? { lines: [] };
  const changes: InvoiceFieldChange[] = [];

  for (const { key, label } of HEADER_FIELDS) {
    const oldValue = normStr(prev[key]);
    const newValue = normStr(next[key]);
    if (oldValue !== newValue) {
      changes.push({ field: label, oldValue, newValue });
    }
  }

  const prevLines = prev.lines ?? [];
  const nextLines = next.lines ?? [];
  const prevByKey = new Map(prevLines.map((l, i) => [lineKey(l, i), l]));
  const nextByKey = new Map(nextLines.map((l, i) => [lineKey(l, i), l]));

  for (const [key, line] of nextByKey) {
    const oldLine = prevByKey.get(key);
    if (!oldLine) {
      changes.push({
        field: `Line added (${line.so_no?.trim() || line.description_of_goods?.trim() || key})`,
        oldValue: null,
        newValue: fmtNum(line.quantity),
        lineKey: key,
      });
      continue;
    }
    const lineLabel = line.so_no?.trim() || line.description_of_goods?.trim() || key;
    if (!numbersClose(oldLine.quantity, line.quantity)) {
      changes.push({
        field: `Line ${lineLabel} — Qty`,
        oldValue: fmtNum(oldLine.quantity),
        newValue: fmtNum(line.quantity),
        lineKey: key,
      });
    }
    if (!numbersClose(oldLine.unit_price, line.unit_price)) {
      changes.push({
        field: `Line ${lineLabel} — Unit price`,
        oldValue: fmtNum(oldLine.unit_price),
        newValue: fmtNum(line.unit_price),
        lineKey: key,
      });
    }
    if (normStr(oldLine.contract_no) !== normStr(line.contract_no)) {
      changes.push({
        field: `Line ${lineLabel} — Contract No`,
        oldValue: normStr(oldLine.contract_no),
        newValue: normStr(line.contract_no),
        lineKey: key,
      });
    }
    if (normStr(oldLine.so_no) !== normStr(line.so_no)) {
      changes.push({
        field: `Line ${lineLabel} — SO No`,
        oldValue: normStr(oldLine.so_no),
        newValue: normStr(line.so_no),
        lineKey: key,
      });
    }
    if (normStr(oldLine.description_of_goods) !== normStr(line.description_of_goods)) {
      changes.push({
        field: `Line ${lineLabel} — Description`,
        oldValue: normStr(oldLine.description_of_goods),
        newValue: normStr(line.description_of_goods),
        lineKey: key,
      });
    }
  }

  for (const [key, line] of prevByKey) {
    if (!nextByKey.has(key)) {
      changes.push({
        field: `Line removed (${line.so_no?.trim() || line.description_of_goods?.trim() || key})`,
        oldValue: fmtNum(line.quantity),
        newValue: null,
        lineKey: key,
      });
    }
  }

  return changes;
}

function numbersClose(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-6;
}
