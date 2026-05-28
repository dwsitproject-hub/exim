/**
 * Shipment note @mentions: stored as markdown-style tokens `@[Display Name](user-uuid)`.
 * Server parses UUIDs for validation, persistence (note_mentions), and notifications.
 */

export function parseMentionUserIdsFromNote(note: string): string[] {
  const ids = new Set<string>();
  const re = /@\[([^\]]*)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(note)) !== null) {
    ids.add(m[2]!);
  }
  return [...ids];
}
