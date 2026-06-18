/**
 * Documentation progress computation for the Export Bulking detail page.
 *
 * Tracks how many documentation tasks are complete across the four
 * workflow steps (Pre-shipment, Customs, Billing, Final) and expresses
 * the result as a percentage.
 */

import type { ExportBulkingShipmentDetail } from "@/types/export-bulking";

export type DocStepKey = "preShipment" | "customs" | "billing" | "finalDocs";

export interface DocProgressItem {
  id: string;
  label: string;
  done: boolean;
  step: DocStepKey;
}

export interface DocStepProgress {
  key: DocStepKey;
  label: string;
  items: DocProgressItem[];
  doneCount: number;
  totalCount: number;
  percent: number;
  complete: boolean;
}

export interface DocProgressSummary {
  steps: DocStepProgress[];
  doneCount: number;
  totalCount: number;
  percent: number;
}

function sentDocsDone(d: ExportBulkingShipmentDetail): boolean {
  const required = d.required_sent_documents ?? [];
  if (required.length === 0) return Boolean(d.bill_of_lading_no);
  return required.every((key) => {
    const field = `sent_${key}` as keyof ExportBulkingShipmentDetail;
    return Boolean(d[field]);
  });
}

const STEP_LABELS: Record<DocStepKey, string> = {
  preShipment: "Pre-shipment Documents",
  customs: "Customs Compliance",
  billing: "Billing & Levy",
  finalDocs: "Final Shipping Documents",
};

export function buildDocumentationProgress(
  d: ExportBulkingShipmentDetail,
): DocProgressSummary {
  const allItems: DocProgressItem[] = [
    // ── Step 1: Pre-shipment Documents ────────────────────────
    {
      id: "si",
      label: "Shipping Instruction",
      done: d.shipping_instructions.length > 0,
      step: "preShipment",
    },
    {
      id: "invoice",
      label: "Invoice",
      done: d.invoices.length > 0,
      step: "preShipment",
    },
    {
      id: "packing_list",
      label: "Packing List",
      done: d.packing_lists.length > 0,
      step: "preShipment",
    },

    // ── Step 2: Customs Compliance ─────────────────────────────
    {
      id: "pe",
      label: "PE (Persetujuan Ekspor)",
      done: Boolean(d.pe_no),
      step: "customs",
    },
    {
      id: "peb",
      label: "PEB (Persetujuan Ekspor Barang)",
      done: Boolean(d.peb_no),
      step: "customs",
    },
    {
      id: "npe_spb",
      label: "NPE & SPB",
      done: Boolean(d.npe_date),
      step: "customs",
    },

    // ── Step 3: Billing & Levy ─────────────────────────────────
    {
      id: "billing_to_gl",
      label: "Billing sent to GL",
      done: Boolean(d.billing_to_gl),
      step: "billing",
    },
    {
      id: "biaya_keluar",
      label: "Biaya Keluar billing",
      done: Boolean(d.biaya_keluar_billing_no),
      step: "billing",
    },
    {
      id: "levy",
      label: "Levy billing",
      done: Boolean(d.levy_billing_no),
      step: "billing",
    },

    // ── Step 4: Final Shipping Documents ──────────────────────
    {
      id: "bl",
      label: "Bill of Lading",
      done: Boolean(d.bill_of_lading_no),
      step: "finalDocs",
    },
    {
      id: "sent_docs",
      label: "Sent documents",
      done: sentDocsDone(d),
      step: "finalDocs",
    },
  ];

  const stepKeys: DocStepKey[] = ["preShipment", "customs", "billing", "finalDocs"];

  const steps: DocStepProgress[] = stepKeys.map((key) => {
    const items = allItems.filter((i) => i.step === key);
    const doneCount = items.filter((i) => i.done).length;
    const totalCount = items.length;
    return {
      key,
      label: STEP_LABELS[key],
      items,
      doneCount,
      totalCount,
      percent: totalCount ? Math.round((doneCount / totalCount) * 100) : 0,
      complete: doneCount === totalCount,
    };
  });

  const doneCount = allItems.filter((i) => i.done).length;
  const totalCount = allItems.length;

  return {
    steps,
    doneCount,
    totalCount,
    percent: totalCount ? Math.round((doneCount / totalCount) * 100) : 0,
  };
}
