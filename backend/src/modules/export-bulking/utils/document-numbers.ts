/** Series keys stored in export_bulking_doc_number_counters.series_code */
export const SERIES_SI_EUP = "SI_EUP";
export const SERIES_CI_EU = "CI_EU";
export const SERIES_PL_EUP = "PL_EUP";

const ROMAN_MONTH = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"] as const;

export function monthToRoman(month1to12: number): string {
  if (month1to12 < 1 || month1to12 > 12) {
    throw new Error(`Invalid month: ${month1to12}`);
  }
  return ROMAN_MONTH[month1to12 - 1];
}

export function utcYearMonthNow(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export function formatPaddedSerial(serial: number, width = 4): string {
  return String(serial).padStart(width, "0");
}

/** SI/EUP/YYYY/<Roman month>/serial */
export function formatSiDocumentNumber(year: number, month: number, serial: number): string {
  return `SI/EUP/${year}/${monthToRoman(month)}/${formatPaddedSerial(serial)}`;
}

/** CI/EU/YYYY/MM/serial (MM = 01–12) */
export function formatInvoiceDocumentNumber(year: number, month: number, serial: number): string {
  const mm = String(month).padStart(2, "0");
  return `CI/EU/${year}/${mm}/${formatPaddedSerial(serial)}`;
}

/** PL/EUP/YYYY/<Roman month>/serial */
export function formatPlDocumentNumber(year: number, month: number, serial: number): string {
  return `PL/EUP/${year}/${monthToRoman(month)}/${formatPaddedSerial(serial)}`;
}
