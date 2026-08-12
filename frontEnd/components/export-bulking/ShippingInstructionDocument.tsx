"use client";

import { useRef } from "react";
import type { ExportBulkingShipmentDetail, ShippingInstruction } from "@/types/export-bulking";
import { formatNumberDisplay } from "@/lib/format-numbers";
import { ExportDocumentToolbar } from "./ExportDocumentToolbar";
import { exportDocumentPdfName } from "./export-document-filename";
import {
  ExportDocumentLetterhead,
  exportDocumentFooterCompanyName,
} from "./ExportDocumentLetterhead";
import { EXPORT_DOCUMENT_LETTERHEAD } from "./export-document-letterhead";
import styles from "./ShippingInstructionDocument.module.css";

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

function formatDestinationDisplay(
  port: string | null | undefined,
  country: string | null | undefined,
): string {
  const p = port?.trim();
  const c = country?.trim();
  if (p && c) return `${p}, ${c}`;
  return p || c || "—";
}

export function ShippingInstructionDocument({
  shipment,
  si,
  blSplitText,
  downloadFilename,
  letterheadImageUrl,
  footerCompanyName,
}: {
  shipment: ExportBulkingShipmentDetail;
  si: ShippingInstruction;
  /** Verbatim B/L split from the form (first cargo line). */
  blSplitText?: string;
  downloadFilename?: string;
  letterheadImageUrl?: string | null;
  footerCompanyName?: string | null;
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

  const blSplitDisplay =
    blSplitText?.trim() ||
    first?.bl_split_text?.trim() ||
    "—";
  const destinationPort = first?.destination_port?.trim() || cargo?.destination_port?.trim() || "";
  const destinationCountry = cargo?.destination_country?.trim() || "";
  const destination = formatDestinationDisplay(destinationPort, destinationCountry);

  const shipperText = si.shipper_snapshot?.trim() || shipment.shipper?.trim() || "—";
  const loadport = dash(shipment.loadport_name);

  const issued = jakartaFooterDate(new Date());
  const usedImageHeader = Boolean(letterheadImageUrl);
  const footerName = exportDocumentFooterCompanyName(
    EXPORT_DOCUMENT_LETTERHEAD.name,
    footerCompanyName,
    usedImageHeader,
  );

  return (
    <div className="si-print-root">
      <ExportDocumentToolbar
        pageRef={pageRef}
        filename={pdfFilename}
        printLabel="Print shipping instruction"
        noPrintClassName="si-print-noPrint"
      />
      <div ref={pageRef} className={styles.printScope}>
      <ExportDocumentLetterhead
        imageUrl={letterheadImageUrl}
        name={EXPORT_DOCUMENT_LETTERHEAD.name}
      />

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
        <div className={styles.footerCompany}>{footerName}</div>
      </footer>

      <div className={styles.signatureReserved} aria-hidden="true" />
      </div>
    </div>
  );
}
