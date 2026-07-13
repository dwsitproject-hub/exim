import type { CargoLine } from "@/types/export-bulking";
import type { Commodity } from "@/services/commodity-service";
import { findCommodityMatch } from "@/services/commodity-service";

export type LoadingDatetimeForm = {
  commence_loading: string;
  etc: string;
  atc: string;
  hose_on: string;
  hose_off: string;
  npe_date: string;
};

function toTime(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const t = new Date(trimmed).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Field-level errors for loading datetime inputs. */
export function validateLoadingDatetimeForm(form: LoadingDatetimeForm): Record<string, string> {
  const errors: Record<string, string> = {};
  const commence = toTime(form.commence_loading);
  const etc = toTime(form.etc);
  const atc = toTime(form.atc);
  const hoseOff = toTime(form.hose_off);
  const npe = toTime(form.npe_date);

  if (commence != null && etc != null && etc < commence) {
    errors.etc = "ETC cannot be earlier than Commence Loading";
  }
  if (commence != null && atc != null && atc < commence) {
    errors.atc = "ATC cannot be earlier than Commence Loading";
  }
  if (atc != null && hoseOff != null && hoseOff < atc) {
    errors.hose_off = "Hose Off cannot be earlier than ATC";
  }
  if (commence != null && npe != null && npe <= commence) {
    errors.npe_date = "NPE Date must be after Commence Loading";
  }

  return errors;
}

export function shipmentHasLiquidCargo(cargoLines: CargoLine[], commodities: Commodity[]): boolean {
  return cargoLines.some((line) => findCommodityMatch(line.cargo_name, commodities)?.commodity_type === "Liquid");
}

export function shipmentHasSolidCargo(cargoLines: CargoLine[], commodities: Commodity[]): boolean {
  return cargoLines.some((line) => findCommodityMatch(line.cargo_name, commodities)?.commodity_type === "Solid");
}

const RECON_DIFF_PCT_CAUTION = 0.3;

export function isReconDiffPctCaution(diffPct: number | null): boolean {
  return diffPct != null && (diffPct < -RECON_DIFF_PCT_CAUTION || diffPct > RECON_DIFF_PCT_CAUTION);
}
