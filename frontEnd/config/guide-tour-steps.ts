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
      title: "Claim, new shipment & couple",
      content:
        "Claim (when shown) takes ownership and creates the first shipment from this PO. Create another shipment appears once this PO is already linked—use it when you need a second new shipment while the first is still in progress (split cargo, second voyage). Couple to shipment attaches this PO to an existing open shipment that matches grouping rules (incoterm, currency, etc.).",
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
