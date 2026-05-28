/**
 * Display vendor/supplier on dashboards — hide obvious placeholder strings and empty values.
 */

function isLikelyPlaceholderText(s: string): boolean {
  const t = s.trim();
  if (t.length < 4) return false;
  for (let len = 1; len <= Math.floor(t.length / 2); len++) {
    if (t.length % len !== 0) continue;
    const chunk = t.slice(0, len);
    if (t === chunk.repeat(t.length / len)) return true;
  }
  return false;
}

export function formatDashboardVendorName(raw: string | null | undefined): string {
  const t = (raw ?? "").trim();
  if (!t) return "—";
  if (isLikelyPlaceholderText(t)) return "—";
  return t;
}
