"use client";

import { useRef } from "react";
import type { ExportBulkingShipmentDetail, ShippingInstruction } from "@/types/export-bulking";
import { formatNumberDisplay } from "@/lib/format-numbers";
import { ExportDocumentToolbar } from "./ExportDocumentToolbar";
import { exportDocumentPdfName } from "./export-document-filename";
import styles from "./ShippingInstructionDocument.module.css";

const LETTERHEAD = {
  name: "PT ENERGI UNGGUL PERSADA",
  lines: [
    "GAMA TOWER, LT 41, JL HR RASUNA SAID, KAV C 22,",
    "KARET KUNINGAN, SETIABUDI, KOTA ADM. JAKARTA SELATAN,",
    "DKI JAKARTA, 12940",
  ],
} as const;

function formatVesselLine(shipment: ExportBulkingShipmentDetail): string {
  const vessel = shipment.vessel_name?.trim() ?? "";
  const voyage = shipment.voyage_number?.trim() ?? "";
  if (vessel && voyage) return `${vessel} V.${voyage}`;
  return vessel || voyage || "—";
}

function jakartaFooterDate(d: Date): string {
  const s = d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `JAKARTA, ${s.toUpperCase()}`;
}

function dash(s: string | null | undefined): string {
  const t = s?.trim();
  return t ? t : "—";
}

export function ShippingInstructionDocument({
  shipment,
  si,
  blSplitText,
  downloadFilename,
}: {
  shipment: ExportBulkingShipmentDetail;
  si: ShippingInstruction;
  /** Verbatim B/L split from the form (first cargo line). */
  blSplitText?: string;
  downloadFilename?: string;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const pdfFilename =
    downloadFilename ?? exportDocumentPdfName("Shipping-Instruction", si.si_number);
  const first = si.lines?.[0];
  const cargo = first?.cargo_line_id
    ? shipment.cargo_lines.find((c) => c.id === first.cargo_line_id)
    : undefined;

  const description =
    first?.description_of_goods?.trim() || cargo?.item_description?.trim() || "";
  const qtyNum =
    first?.quantity != null ? Number(first.quantity) : cargo?.quantity != null ? Number(cargo.quantity) : null;
  const quantityLine =
    qtyNum != null && !Number.isNaN(qtyNum) ? `${formatNumberDisplay(qtyNum)} MT` : "—";

  const blSplitDisplay = blSplitText?.trim() ? blSplitText.trim() : "—";
  const destination = dash(first?.destination_port ?? cargo?.destination_port);

  const shipperText = si.shipper_snapshot?.trim() || shipment.shipper?.trim() || "—";
  const loadport = dash(shipment.loadport_name);

  const issued = jakartaFooterDate(new Date());

  return (
    <div className="si-print-root">
      <ExportDocumentToolbar
        pageRef={pageRef}
        filename={pdfFilename}
        printLabel="Print shipping instruction"
        noPrintClassName="si-print-noPrint"
      />
      <div ref={pageRef} className={styles.printScope}>
      <header>
        <h1 className={styles.companyName}>{LETTERHEAD.name}</h1>
        {LETTERHEAD.lines.map((line) => (
          <p key={line} className={styles.companyAddr}>
            {line}
          </p>
        ))}
        <hr className={styles.rule} />
      </header>

      <div className={styles.messrsTitleBlock}>
        <div className={styles.messrsBlock}>
          <p className={styles.messrsLabel}>MESSRS</p>
          <p className={styles.messrsAgency}>{dash(si.messrs)}</p>
        </div>
        <div className={styles.titleCol}>
          <h2 className={styles.title}>SHIPPING – INSTRUCTION</h2>
          <p className={styles.subNo}>
            No.: <span>{si.si_number?.trim() || "—"}</span>
          </p>
        </div>
      </div>

      <section className={styles.bodyGrid} aria-label="Shipping instruction details">
        <div className={styles.label}>Vessel name</div>
        <div className={styles.value}>{formatVesselLine(shipment)}</div>

        <div className={styles.label}>Descr. of good</div>
        <div className={styles.value}>{description || "—"}</div>

        <div className={styles.label}>Quantity</div>
        <div className={styles.value}>{quantityLine}</div>

        <div className={styles.label}>BL split</div>
        <div className={styles.value}>{blSplitDisplay}</div>

        <div className={styles.label}>Shipment from</div>
        <div className={styles.value}>{loadport}</div>

        <div className={styles.label}>Destination</div>
        <div className={styles.value}>{destination}</div>

        <div className={styles.label}>Bill of lading</div>
        <div className={styles.value}>{dash(si.bill_of_lading_option)}</div>

        <div className={styles.label}>Consignee</div>
        <div className={styles.value}>{dash(si.consignee)}</div>

        <div className={styles.label}>Notify party</div>
        <div className={styles.value}>{dash(si.notify_party)}</div>

        <div className={styles.label}>Freight</div>
        <div className={styles.value}>{dash(si.freight)}</div>

        <div className={styles.label}>Shipper</div>
        <div className={styles.value}>{shipperText}</div>

        <div className={styles.label}>NPWP</div>
        <div className={styles.value}>{dash(si.npwp)}</div>

        <div className={styles.label}>BL indicated</div>
        <div className={styles.value}>{dash(si.bl_indicated)}</div>
      </section>

      <footer className={styles.footer}>
        <div>{issued}</div>
        <div className={styles.footerCompany}>{LETTERHEAD.name}</div>
      </footer>

      <div className={styles.signatureReserved} aria-hidden="true" />
      </div>
    </div>
  );
}
