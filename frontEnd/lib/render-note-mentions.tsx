import type { ReactNode } from "react";
import styles from "./note-mentions.module.css";

const MENTION_RE = /@\[([^\]]*)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

/**
 * Renders plain text with `@[Label](uuid)` tokens as highlighted inline mentions.
 */
export function renderNoteWithMentions(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, "gi");
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(text.slice(last, m.index));
    }
    const label = (m[1] ?? "").trim() || "user";
    nodes.push(
      <span key={`m-${key++}`} className={styles.mention}>
        @{label}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes.length > 0 ? nodes : text;
}
