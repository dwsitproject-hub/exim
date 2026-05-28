"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { listMentionableUsers } from "@/services/users-service";
import type { MentionableUser } from "@/types/users";
import { isApiError } from "@/types/api";
import styles from "./ShipmentNoteMentionTextarea.module.css";

const MENTION_TOKEN =
  /@\[([^\]]*)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export interface ShipmentNoteMentionTextareaProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  accessToken: string | null;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
  "aria-describedby"?: string;
}

function getActiveMention(
  text: string,
  cursor: number
): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  const charBefore = at > 0 ? before[at - 1] : " ";
  if (charBefore !== " " && charBefore !== "\n" && at !== 0) return null;
  const afterAt = before.slice(at + 1);
  if (afterAt.includes(" ") || afterAt.includes("\n")) return null;
  return { start: at, query: afterAt };
}

function sanitizeMentionLabel(name: string, email: string): string {
  const u = name.replace(/\]/g, "").trim();
  if (u) return u.slice(0, 120);
  return email.replace(/\]/g, "").slice(0, 120);
}

/** Serialize editor DOM to API string (handles nested divs / BR from contenteditable). */
function serializeEditor(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeName === "BR") {
      out += "\n";
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const id = el.dataset.mentionId;
      if (id) {
        const raw = el.textContent ?? "";
        const label = raw.startsWith("@") ? raw.slice(1) : raw;
        const safe = label.replace(/\]/g, "").trim() || "user";
        out += `@[${safe}](${id})`;
        return;
      }
      for (const c of el.childNodes) walk(c);
    }
  };
  for (const c of root.childNodes) walk(c);
  return out;
}

function fillEditorFromSerialized(root: HTMLElement, serialized: string, chipClass: string): void {
  root.replaceChildren();
  const re = new RegExp(MENTION_TOKEN.source, "gi");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(serialized)) !== null) {
    if (m.index > last) {
      root.appendChild(document.createTextNode(serialized.slice(last, m.index)));
    }
    const span = document.createElement("span");
    span.contentEditable = "false";
    span.className = chipClass;
    span.dataset.mentionId = m[2]!;
    const display = (m[1] ?? "").trim() || "user";
    span.textContent = `@${display}`;
    root.appendChild(span);
    last = m.index + m[0].length;
  }
  if (last < serialized.length) {
    root.appendChild(document.createTextNode(serialized.slice(last)));
  }
}

function getCaretSerializedOffset(root: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !root.contains(sel.anchorNode)) {
    return serializeEditor(root).length;
  }
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const marker = document.createTextNode("\ufeff");
  range.insertNode(marker);
  const serialized = serializeEditor(root);
  const idx = serialized.indexOf("\ufeff");
  marker.remove();
  return idx < 0 ? serialized.length : idx;
}

function setCaretSerializedOffset(root: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const selection: Selection = sel;
  let pos = 0;
  let done = false;

  function placeText(n: Text, o: number) {
    const len = (n.textContent ?? "").length;
    const oClamped = Math.max(0, Math.min(o, len));
    const r = document.createRange();
    r.setStart(n, oClamped);
    r.collapse(true);
    selection.removeAllRanges();
    selection.addRange(r);
    done = true;
  }

  function walk(node: Node): void {
    if (done) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node as Text;
      const len = (t.textContent ?? "").length;
      if (pos + len >= offset) {
        placeText(t, offset - pos);
        return;
      }
      pos += len;
      return;
    }
    if (node.nodeName === "BR") {
      if (pos + 1 >= offset) {
        const r = document.createRange();
        if (offset <= pos) {
          r.setStartBefore(node);
        } else {
          r.setStartAfter(node);
        }
        r.collapse(true);
        selection.removeAllRanges();
        selection.addRange(r);
        done = true;
        return;
      }
      pos += 1;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const id = el.dataset.mentionId;
      if (id) {
        const raw = el.textContent ?? "";
        const label = raw.startsWith("@") ? raw.slice(1) : raw;
        const safe = label.replace(/\]/g, "").trim() || "user";
        const len = `@[${safe}](${id})`.length;
        if (pos + len >= offset) {
          const r = document.createRange();
          r.setStartAfter(el);
          r.collapse(true);
          selection.removeAllRanges();
          selection.addRange(r);
          done = true;
          return;
        }
        pos += len;
        return;
      }
      for (const c of el.childNodes) {
        walk(c);
        if (done) return;
      }
    }
  }

  for (const c of root.childNodes) {
    walk(c);
    if (done) return;
  }

  const r = document.createRange();
  r.selectNodeContents(root);
  r.collapse(false);
  selection.removeAllRanges();
  selection.addRange(r);
}

function insertPlainTextAtRange(text: string): void {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  range.setStartAfter(range.endContainer);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function ShipmentNoteMentionTextarea({
  id,
  value,
  onChange,
  accessToken,
  placeholder = "Write a note…",
  rows = 4,
  disabled = false,
  className,
  "aria-describedby": ariaDescribedBy,
}: ShipmentNoteMentionTextareaProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [candidates, setCandidates] = useState<MentionableUser[]>([]);
  const [loadingMentions, setLoadingMentions] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const fetchMentions = useCallback(
    (q: string) => {
      if (!accessToken) {
        setCandidates([]);
        return;
      }
      setLoadingMentions(true);
      listMentionableUsers({ q: q || undefined, limit: 20 }, accessToken)
        .then((res) => {
          if (!isApiError(res) && Array.isArray(res.data)) setCandidates(res.data);
          else setCandidates([]);
        })
        .catch(() => setCandidates([]))
        .finally(() => setLoadingMentions(false));
    },
    [accessToken]
  );

  useEffect(() => {
    if (!mentionOpen) return;
    const t = window.setTimeout(() => fetchMentions(mentionQuery), 250);
    return () => window.clearTimeout(t);
  }, [mentionOpen, mentionQuery, fetchMentions]);

  useEffect(() => {
    setHighlightIdx(0);
  }, [candidates]);

  useEffect(() => {
    if (!mentionOpen) return;
    const onDoc = (e: MouseEvent) => {
      const wrap = wrapRef.current;
      const t = e.target;
      if (wrap && t instanceof Node && wrap.contains(t)) return;
      setMentionOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [mentionOpen]);

  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const current = serializeEditor(el);
    if (current === value) return;
    fillEditorFromSerialized(el, value, styles.mentionChip);
  }, [value]);

  function syncMentionStateFromEditor() {
    const el = editorRef.current;
    if (!el) return;
    const serialized = serializeEditor(el);
    const caret = getCaretSerializedOffset(el);
    const m = getActiveMention(serialized, caret);
    if (m) {
      setMentionQuery(m.query);
      setMentionOpen(true);
      setHighlightIdx(0);
    } else {
      setMentionOpen(false);
    }
  }

  function emitFromEditor() {
    const el = editorRef.current;
    if (!el) return;
    onChange(serializeEditor(el));
    syncMentionStateFromEditor();
  }

  function applyMention(user: MentionableUser) {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const serialized = serializeEditor(el);
    const caret = getCaretSerializedOffset(el);
    const m = getActiveMention(serialized, caret);
    if (!m) return;
    const label = sanitizeMentionLabel(user.name, user.email);
    const token = `@[${label}](${user.id})`;
    const next = `${serialized.slice(0, m.start)}${token} ${serialized.slice(caret)}`;
    onChange(next);
    fillEditorFromSerialized(el, next, styles.mentionChip);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      setCaretSerializedOffset(el, m.start + token.length + 1);
    });
  }

  function onEditorInput() {
    emitFromEditor();
  }

  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    insertPlainTextAtRange(text);
    emitFromEditor();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (mentionOpen && candidates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, candidates.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        applyMention(candidates[highlightIdx]!);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }
    if (e.key === "Escape") setMentionOpen(false);
  }

  const editorClass = [styles.editor, className].filter(Boolean).join(" ");
  const minHeightRem = Math.max(4, rows) * 1.25;

  return (
    <div ref={wrapRef} className={styles.wrap}>
      <div
        ref={editorRef}
        id={id}
        role="textbox"
        aria-multiline="true"
        contentEditable={!disabled}
        suppressContentEditableWarning
        className={editorClass}
        style={{ minHeight: `${minHeightRem}rem` }}
        data-placeholder={placeholder}
        aria-autocomplete={mentionOpen ? "list" : undefined}
        aria-controls={mentionOpen ? listId : undefined}
        aria-expanded={mentionOpen}
        aria-describedby={ariaDescribedBy}
        onInput={onEditorInput}
        onKeyUp={syncMentionStateFromEditor}
        onClick={syncMentionStateFromEditor}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
      />
      {mentionOpen ? (
        <div id={listId} className={styles.dropdown} role="listbox" aria-label="Mention user">
          {loadingMentions ? (
            <p className={styles.dropdownEmpty}>Loading…</p>
          ) : candidates.length === 0 ? (
            <p className={styles.dropdownEmpty}>No users match.</p>
          ) : (
            candidates.map((u, i) => (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={i === highlightIdx}
                className={`${styles.dropdownItem} ${i === highlightIdx ? styles.dropdownItemActive : ""}`}
                onMouseDown={(ev) => ev.preventDefault()}
                onClick={() => applyMention(u)}
              >
                {u.name || u.email}
                <span className={styles.dropdownItemEmail}>{u.email}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
      <p className={styles.hint}>Type @ to mention a teammate. They will be notified when you post.</p>
    </div>
  );
}
