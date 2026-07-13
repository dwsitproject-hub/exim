export type LoadingDatetimeFields = {
  commence_loading?: string | null;
  etc?: string | null;
  atc?: string | null;
  hose_off?: string | null;
  npe_date?: string | null;
};

function toTime(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Validates loading-stage datetime ordering. Returns human-readable error messages. */
export function validateLoadingDatetimeRules(fields: LoadingDatetimeFields): string[] {
  const errors: string[] = [];
  const commence = toTime(fields.commence_loading);
  const etc = toTime(fields.etc);
  const atc = toTime(fields.atc);
  const hoseOff = toTime(fields.hose_off);
  const npe = toTime(fields.npe_date);

  if (commence != null && etc != null && etc < commence) {
    errors.push("ETC cannot be earlier than Commence Loading");
  }
  if (commence != null && atc != null && atc < commence) {
    errors.push("ATC cannot be earlier than Commence Loading");
  }
  if (atc != null && hoseOff != null && hoseOff < atc) {
    errors.push("Hose Off cannot be earlier than ATC");
  }
  if (commence != null && npe != null && npe <= commence) {
    errors.push("NPE Date must be after Commence Loading");
  }

  return errors;
}
