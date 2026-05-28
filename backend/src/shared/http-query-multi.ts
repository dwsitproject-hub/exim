/** Parse repeated query params (string | string[]) plus optional CSV fallback key. */

export function collectQueryStringList(q: Record<string, unknown>, key: string): string[] {
  const raw = q[key];
  if (Array.isArray(raw)) {
    return [
      ...new Set(
        raw
          .filter((x): x is string => typeof x === "string")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      ),
    ];
  }
  if (typeof raw === "string" && raw.trim()) {
    return [raw.trim()];
  }
  return [];
}

export function mergeFilterTokens(q: Record<string, unknown>, key: string, csvKey: string): string[] | undefined {
  const fromRepeat = collectQueryStringList(q, key);
  const csvRaw = q[csvKey];
  const fromCsv =
    typeof csvRaw === "string" && csvRaw.trim()
      ? csvRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)
      : [];
  const merged = [...new Set([...fromRepeat, ...fromCsv])];
  return merged.length ? merged : undefined;
}
