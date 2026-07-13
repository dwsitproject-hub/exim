import type { Step } from "react-joyride";
import type { GuideTourStepsByRoute } from "@/types/guide-tour";

const DASHBOARD_ANALYTICS_TARGET = '[data-tour="dashboard-analytics"]';

export const GUIDE_TOUR_STEPS: GuideTourStepsByRoute = {
  dashboard: [
    {
      target: DASHBOARD_ANALYTICS_TARGET,
      title: "Shipment analytics & drill-down",
      content:
        "These cards summarize imports by plant, product classification, and logistics mode. Click a card, row, or pill to drill into a detail table—quantities and values for the filtered date range. Use Filter to narrow PT, plant, vendor, and more.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="dashboard-recent-shipments"]',
      title: "Recent shipments",
      content:
        "This list is loaded with a rolling 7-day PO date window (based on each shipment’s linked PO dates). “View all” opens the Shipment list with the same from/to dates applied so you see the full set, not just the preview.",
      placement: "top",
      skipBeacon: true,
    },
  ],

  poDetail: [
    {
      target: '[data-tour="po-status-badge"]',
      title: "PO status",
      content:
        "The badge reflects intake status in the EOS lifecycle—for example new PO detected, claimed, in progress, or fulfilled. It tells you what actions are allowed next and how far the PO has moved through intake and shipment linking.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="po-primary-actions"]',
      title: "New shipment & couple",
      content:
        "New shipment creates a linked shipment from this PO—claiming ownership when needed (first time or after a delivered leg with quantity still open). Use it again while a shipment is in progress for split cargo or a second booking. Couple to shipment attaches this PO to an existing open shipment that matches grouping rules (incoterm, currency, etc.).",
      placement: "top",
      skipBeacon: true,
    },
    {
      target: '[data-tour="po-items-remaining-header"]',
      title: "Remaining qty",
      content:
        "Remaining qty is the key fulfillment metric: ordered quantity minus what has already been delivered across linked shipments. Track it per line to see what still needs to ship or close out the PO.",
      placement: "bottom",
      skipBeacon: true,
    },
  ],

  shipmentList: [
    {
      target: '[data-tour="shipment-column-filters"]',
      title: "Column filters",
      content:
        "Each column header can open a filter control—similar in spirit to Google Sheets: pick one or more values to restrict the grid. Filters combine with the search box and PO date range. Use “Clear column filters” to reset all column selections at once.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="shipment-column-picker"]',
      title: "Show or hide columns",
      content:
        "Use the column picker (beside “Clear column filters”) to turn columns on or off. Locked columns such as PT, Plant, and Shipment stay visible; optional columns can be toggled so the table matches what you need to review or export.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="shipment-po-date-filter"]',
      title: "PO date range",
      content:
        "Set From / To PO dates and Apply to restrict rows by linked purchase-order dates—useful for historical tracking and reconciling a period. Clear removes the date window from the URL and list query.",
      placement: "bottom",
      skipBeacon: true,
    },
  ],

  shipmentDetail: [
    {
      target: '[data-tour="shipment-status-timeline"]',
      title: "Status timeline",
      content:
        "The timeline shows the shipment lifecycle: each step reflects statuses from intake through delivery. Past steps show when EOS recorded a transition; upcoming steps show what is still ahead. It is the map of where this shipment sits in the process.",
      placement: "left",
      skipBeacon: true,
    },
    {
      target: '[data-tour="shipment-main-form"]',
      title: "Shipment data & Update shipment",
      content:
        "Across the cards (Pre Shipment, schedules, customs, line items, etc.), fields may be highlighted when they are required for the next status. Click Update shipment to edit, then Save to persist—status cannot advance while unsaved edits are open. Fill highlighted rows and linked PO sections before moving on.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="shipment-update-status"]',
      title: "Update status & required checks",
      content:
        "Choose New status to see what EOS still needs: a legend and highlighted rows mark missing fields; the list links jump to each item. Required documents are listed when uploads must be in place—use the Documents section. Typical flow: pick the next status → complete highlighted fields and documents → Update shipment / Save if needed → optional Remarks → Update status.",
      placement: "left",
      skipBeacon: true,
    },
    {
      target: '[data-tour="shipment-documents"]',
      title: "Documents",
      content:
        "Upload slots match the paperwork EOS expects (PO, invoice, packing list, BL, PIB, etc.). Categories can highlight when a file is still required for the status you selected. Per-PO uploads are grouped where the shipment spans multiple intakes.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="shipment-notes"]',
      title: "Notes",
      content:
        "Notes are an internal log: add context for your team (issues, handoffs, carrier instructions) without changing operational data. They are separate from status Remarks (stored on the status transition) and from document uploads.",
      placement: "bottom",
      skipBeacon: true,
    },
  ],

  exportBulkingList: [
    {
      target: '[data-tour="export-bulking-page"]',
      title: "Welcome to Export Bulking",
      content:
        "This workspace tracks export bulk shipments from planning through voyage completion. Operations teams manage vessel schedules and status; documentation teams handle shipping instructions, invoices, and customs paperwork—all on one list.",
      placement: "center",
      skipBeacon: true,
    },
    {
      target: '[data-tour="export-bulking-create-btn"]',
      title: "New shipment",
      content:
        "Start here to register a new export bulking shipment. You will enter vessel, voyage, shipper, load port, and at least one cargo line. The shipment is created in Shipment Planning status and opens on the detail page.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="export-bulking-create-submit"]',
      title: "Create & Open",
      content:
        "After filling out the form, click Create & Open → to save the shipment and go straight to its detail page. Required fields are validated before submit—fix any errors shown under the inputs.",
      placement: "top",
      skipBeacon: true,
    },
    {
      target: '[data-tour="export-bulking-search"]',
      title: "Search shipments",
      content:
        "Search by shipment number, vessel, shipper, or—on the Document view—document numbers (SI, invoice, packing list, PEB, BL). Results update as you type.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="export-bulking-view-tabs"]',
      title: "Operations vs Document view",
      content:
        "Switch list columns to match your role: Operations shows laycan, cargo readiness, and ETA; Document shows SI, invoice, PL, PEB, and BL numbers plus PIC assignment. All shows both when you have access.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="export-bulking-status-filters"]',
      title: "Status filters",
      content:
        "Filter the grid by workflow status (Shipment Planning, Nomination, Arrival, and so on). Counts on each pill show how many shipments are in that stage. Clear resets column filters.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="export-bulking-grid"]',
      title: "Shipment grid",
      content:
        "Each row shows progress, status, and key voyage data. Click a shipment number to open the detail page—operations advances status there; documentation completes cargo, SI, invoices, and export documents on the Document tab.",
      placement: "bottom",
      skipBeacon: true,
    },
  ],

  exportBulkingDetail: [
    {
      target: '[data-tour="export-bulking-status-stepper"]',
      title: "Voyage status workflow",
      content:
        "The stepper shows the six operations stages: Shipment Planning → Nomination → Arrival → At Berth → Loading → Case Off. Advance only when required fields for the current stage are complete and changes are saved.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="export-bulking-detail-tabs"]',
      title: "Operations & Document tabs",
      content:
        "Operations covers voyage planning, nomination dates, and loading milestones. Document covers cargo destinations, shipping instructions, invoices, packing lists, PEB, SAP data, billing, and bill of lading.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="export-bulking-advance-status"]',
      title: "Advance status",
      content:
        "When blockers are cleared, use Advance to move to the next voyage stage. Save all sections first—unsaved edits prevent advancement. Documentation work runs in parallel and does not change this status.",
      placement: "bottom",
      skipBeacon: true,
    },
    {
      target: '[data-tour="export-bulking-doc-progress"]',
      title: "Documentation progress",
      content:
        "On the Document tab, four steps track pre-shipment docs, customs (PEB & SAP), billing & levy, and final shipping documents. Open the sidebar to upload supporting files.",
      placement: "bottom",
      skipBeacon: true,
    },
  ],
};

/** When analytics isn’t on the page (e.g. no permission), use a centered fallback instead of the real target. */
export const DASHBOARD_ANALYTICS_FALLBACK_STEP: Step = {
  target: "body",
  placement: "center",
  title: "Shipment analytics",
  content:
    "Shipment analytics (drill-down by plant, classification, and logistics) appears here when your role can view shipments. After access is granted, open this guide again from the header to highlight those cards.",
  skipBeacon: true,
};

/** When the table has no rows, filters and column picker are hidden—single centered step. */
export const SHIPMENT_LIST_FILTERS_AND_PICKER_FALLBACK_STEP: Step = {
  target: "body",
  placement: "center",
  title: "Column filters & visibility",
  content:
    "When this list has rows, each column header offers multi-select filters (spreadsheet-style), and the toolbar includes a column picker to show or hide optional columns (PT, Plant, and Shipment stay visible). Load data or relax search / PO dates, then run the guide again.",
  skipBeacon: true,
};

export function resolveDashboardSteps(): Step[] {
  if (typeof document === "undefined") return GUIDE_TOUR_STEPS.dashboard;
  const hasAnalytics = !!document.querySelector(DASHBOARD_ANALYTICS_TARGET);
  const [analyticsStep, recentStep] = GUIDE_TOUR_STEPS.dashboard;
  const first = hasAnalytics ? analyticsStep : DASHBOARD_ANALYTICS_FALLBACK_STEP;
  return [first, recentStep];
}

export function resolveShipmentListSteps(): Step[] {
  if (typeof document === "undefined") return GUIDE_TOUR_STEPS.shipmentList;
  const hasToolbar = !!document.querySelector('[data-tour="shipment-column-filters"]');
  const [colStep, pickerStep, dateStep] = GUIDE_TOUR_STEPS.shipmentList;
  if (!hasToolbar) {
    return [SHIPMENT_LIST_FILTERS_AND_PICKER_FALLBACK_STEP, dateStep];
  }
  return [colStep, pickerStep, dateStep];
}

/** Shown when the user is on Forwarder Bidding (or another view) where Details layout is not mounted. */
export const SHIPMENT_DETAIL_DETAILS_TAB_FALLBACK_STEP: Step = {
  target: "body",
  placement: "center",
  title: "Open the Details tab",
  content:
    "The guided highlights for timeline, main shipment fields, status update, documents, and notes are on the Details tab. Switch to Details, then open Guide again to step through those areas.",
  skipBeacon: true,
};

export function resolveShipmentDetailSteps(): Step[] {
  if (typeof document === "undefined") return GUIDE_TOUR_STEPS.shipmentDetail;
  const hasDetailsLayout = !!document.querySelector('[data-tour="shipment-main-form"]');
  if (!hasDetailsLayout) {
    return [SHIPMENT_DETAIL_DETAILS_TAB_FALLBACK_STEP];
  }
  return GUIDE_TOUR_STEPS.shipmentDetail.filter((s) => {
    const sel = typeof s.target === "string" ? s.target : "";
    if (!sel) return true;
    return !!document.querySelector(sel);
  });
}

function selectorExists(selector: string): boolean {
  if (typeof document === "undefined") return true;
  return !!document.querySelector(selector);
}

/** Drops the items-table step when this PO has no lines (table not rendered). */
export function resolvePoDetailSteps(): Step[] {
  return GUIDE_TOUR_STEPS.poDetail.filter((s) => {
    const sel = typeof s.target === "string" ? s.target : "";
    if (!sel) return true;
    return selectorExists(sel);
  });
}

export const EXPORT_BULKING_CREATE_SUBMIT_FALLBACK_STEP: Step = {
  target: "body",
  placement: "center",
  title: "Create & Open",
  content:
    "Open New shipment to fill the create form, then click Create & Open → in the modal footer to save and open the new shipment detail page.",
  skipBeacon: true,
};

export const EXPORT_BULKING_GRID_FALLBACK_STEP: Step = {
  target: "body",
  placement: "center",
  title: "Shipment grid",
  content:
    "When shipments exist, the grid lists progress, status, and voyage fields. Click a shipment number to open its detail page and continue operations or documentation work.",
  skipBeacon: true,
};

export const EXPORT_BULKING_DETAIL_TAB_FALLBACK_STEP: Step = {
  target: "body",
  placement: "center",
  title: "Open the Document tab",
  content:
    "Documentation progress and upload highlights are on the Document tab. Switch to Document, then open Guide from the header to step through those sections.",
  skipBeacon: true,
};

export function resolveExportBulkingListSteps(): Step[] {
  if (typeof document === "undefined") return GUIDE_TOUR_STEPS.exportBulkingList;
  const steps = [...GUIDE_TOUR_STEPS.exportBulkingList];
  const createBtn = document.querySelector('[data-tour="export-bulking-create-btn"]');
  if (!createBtn) {
    steps[1] = {
      target: "body",
      placement: "center",
      title: "New shipment",
      content:
        "Users with create permission see New shipment in the toolbar to register export bulking shipments. Ask your administrator if the button is not visible.",
      skipBeacon: true,
    };
    steps[2] = EXPORT_BULKING_CREATE_SUBMIT_FALLBACK_STEP;
  }
  const hasGrid = !!document.querySelector('[data-tour="export-bulking-grid"]');
  if (!hasGrid) {
    steps[steps.length - 1] = EXPORT_BULKING_GRID_FALLBACK_STEP;
  }
  return steps.filter((s) => {
    const sel = typeof s.target === "string" ? s.target : "";
    if (!sel || sel === "body") return true;
    if (sel === '[data-tour="export-bulking-create-submit"]' && createBtn) return true;
    return !!document.querySelector(sel);
  });
}

export function resolveExportBulkingDetailSteps(): Step[] {
  if (typeof document === "undefined") return GUIDE_TOUR_STEPS.exportBulkingDetail;
  const onDocTab = !!document.querySelector('[data-tour="export-bulking-doc-progress"]');
  const base = GUIDE_TOUR_STEPS.exportBulkingDetail.filter((s) => {
    const sel = typeof s.target === "string" ? s.target : "";
    if (!sel) return true;
    if (s.target === '[data-tour="export-bulking-doc-progress"]') return onDocTab;
    return !!document.querySelector(sel);
  });
  if (!onDocTab && base.length < GUIDE_TOUR_STEPS.exportBulkingDetail.length) {
    return [...base.slice(0, 3), EXPORT_BULKING_DETAIL_TAB_FALLBACK_STEP];
  }
  return base;
}
