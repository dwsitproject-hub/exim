import type { BillOfLadingUpsertPayload, ExportBulkingShipmentDetail } from "@/types/export-bulking";

export type BillOfLadingDraft = {
  rowKey: string;
  id?: string;
  bill_of_lading_no: string;
  bill_of_lading_date: string;
  bill_of_lading_nn_obl: string;
};

export function buildBillOfLadingDrafts(data: ExportBulkingShipmentDetail): BillOfLadingDraft[] {
  const saved = data.bills_of_lading ?? [];
  if (saved.length > 0) {
    return saved.map((row) => ({
      rowKey: row.id,
      id: row.id,
      bill_of_lading_no: row.bill_of_lading_no ?? "",
      bill_of_lading_date: row.bill_of_lading_date ? row.bill_of_lading_date.slice(0, 10) : "",
      bill_of_lading_nn_obl: row.bill_of_lading_nn_obl ?? "",
    }));
  }
  if (data.bill_of_lading_no?.trim()) {
    return [
      {
        rowKey: "legacy-bl",
        bill_of_lading_no: data.bill_of_lading_no,
        bill_of_lading_date: data.bill_of_lading_date ? data.bill_of_lading_date.slice(0, 10) : "",
        bill_of_lading_nn_obl: data.bill_of_lading_nn_obl ?? "",
      },
    ];
  }
  return [
    {
      rowKey: "new-bl-1",
      bill_of_lading_no: "",
      bill_of_lading_date: "",
      bill_of_lading_nn_obl: "",
    },
  ];
}

export function billOfLadingDraftsToPayload(drafts: BillOfLadingDraft[]): BillOfLadingUpsertPayload[] {
  return drafts
    .filter(
      (row) =>
        row.bill_of_lading_no.trim() ||
        row.bill_of_lading_date.trim() ||
        row.bill_of_lading_nn_obl.trim(),
    )
    .map((row, idx) => ({
      id: row.id,
      line_order: idx + 1,
      bill_of_lading_no: row.bill_of_lading_no.trim() || null,
      bill_of_lading_date: row.bill_of_lading_date
        ? new Date(`${row.bill_of_lading_date}T00:00:00`).toISOString()
        : null,
      bill_of_lading_nn_obl: row.bill_of_lading_nn_obl.trim() || null,
    }));
}
