/** Linked PO lines used to compute shipment total invoice (IDR). */
export type LinkedPoForTotalInvoice = {
  currency: string | null;
  currency_rate?: number | null;
  items?: ReadonlyArray<{
    delivery_qty?: number | null;
    unit_price?: number | null;
  }>;
};

function isPoCurrencyIdr(currency: string | null | undefined): boolean {
  const c = (currency ?? "").trim().toUpperCase();
  return c === "IDR" || c === "RP";
}

/**
 * Total invoice in IDR — same rules as shipment detail `total_items_amount`:
 * Σ(delivered_qty × unit_price) in PO currency, then × group FX rate when not IDR/RP.
 */
export function computeShipmentTotalInvoiceAmountIdr(linked: LinkedPoForTotalInvoice[]): number {
  if (linked.length === 0) return 0;

  let sumInPoCurrency = 0;
  for (const po of linked) {
    for (const item of po.items ?? []) {
      const unitPrice = Number(item.unit_price ?? 0);
      const deliveredQty = Number(item.delivery_qty ?? 0);
      const price = Number.isFinite(unitPrice) ? unitPrice : 0;
      const qty = Number.isFinite(deliveredQty) ? deliveredQty : 0;
      sumInPoCurrency += price * qty;
    }
  }

  if (isPoCurrencyIdr(linked[0]?.currency)) return sumInPoCurrency;

  let groupRate: number | null = null;
  for (const po of linked) {
    const r = po.currency_rate != null ? Number(po.currency_rate) : NaN;
    if (Number.isFinite(r) && r > 0) {
      groupRate = r;
      break;
    }
  }
  return sumInPoCurrency * (groupRate ?? 1);
}
