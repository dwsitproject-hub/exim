/** Case-insensitive string equality (trimmed). */
export function equalsIgnoreCase(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** Return the canonical option string when `input` matches ignoring case, else null. */
export function findMatchingOption(
  options: readonly string[],
  input: string,
): string | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  return options.find((o) => o.trim().toLowerCase() === q) ?? null;
}
