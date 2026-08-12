"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/forms";
import { ActivityLogRibbonIcon } from "@/components/icons/ActivityLogRibbonIcon";
import { formatDateTime } from "@/lib/format-date";
import type { ActivityLogItem } from "@/types/activity-log";
import styles from "./ActivityLogRibbon.module.css";

function renderActivityValue(value: string | null | undefined): string {
  if (value == null) return "—";
  const trimmed = value.trim();
  return trimmed === "" ? "—" : trimmed;
}

export interface ActivityLogRibbonProps {
  panelId: string;
  title?: string;
  /** Optional description under the panel title; omitted when empty. */
  hint?: string;
  open: boolean;
  loading: boolean;
  error: string | null;
  items: ActivityLogItem[];
  onOpen: () => void;
  onClose: () => void;
  typeLabel: (type: string) => string;
  /** When false, ribbon trigger is hidden (e.g. while page is loading). */
  visible?: boolean;
}

export function ActivityLogRibbon({
  panelId,
  title = "Activity log",
  hint = "",
  open,
  loading,
  error,
  items,
  onOpen,
  onClose,
  typeLabel,
  visible = true,
}: ActivityLogRibbonProps) {
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        className={styles.ribbonTrigger}
        onClick={onOpen}
        aria-expanded={open}
        aria-controls={panelId}
        title="Activity log"
      >
        <ActivityLogRibbonIcon className={styles.ribbonIcon} />
        <span className={styles.ribbonLabel}>Activity</span>
      </button>

      {open &&
        portalMounted &&
        createPortal(
          <>
            <div className={styles.panelBackdrop} aria-hidden onClick={onClose} />
            <aside
              id={panelId}
              className={styles.panel}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${panelId}-title`}
            >
              <div className={styles.panelHeader}>
                <h2 id={`${panelId}-title`} className={styles.panelTitle}>
                  {title}
                </h2>
                <Button type="button" variant="secondary" onClick={onClose}>
                  Close
                </Button>
              </div>
              {hint ? <p className={styles.panelHint}>{hint}</p> : null}
              <div className={styles.panelBody} role="feed" aria-busy={loading}>
                {loading && <p className={styles.panelState}>Loading…</p>}
                {!loading && error && <p className={styles.error}>{error}</p>}
                {!loading && !error && items.length === 0 && (
                  <p className={styles.panelState}>No activity yet.</p>
                )}
                {!loading && !error && items.length > 0 && (
                  <ul className={styles.list}>
                    {items.map((item) => (
                      <li key={item.id} className={styles.listItem}>
                        <div className={styles.listMeta}>
                          <span className={styles.typeTag}>{typeLabel(item.type)}</span>
                          <time className={styles.time} dateTime={item.occurred_at}>
                            {formatDateTime(item.occurred_at)}
                          </time>
                        </div>
                        <p className={styles.itemTitle}>{item.title}</p>
                        {item.detail ? <p className={styles.itemDetail}>{item.detail}</p> : null}
                        {item.field_changes && item.field_changes.length > 0 ? (
                          <div className={styles.fieldChanges}>
                            {item.field_changes.map((change, idx) => (
                              <div key={`${item.id}-change-${idx}`} className={styles.fieldChangeRow}>
                                <span className={styles.fieldChangeLabel}>{change.label}</span>
                                <span className={styles.fieldChangeValue}>
                                  {renderActivityValue(change.before)} {" → "}{" "}
                                  {renderActivityValue(change.after)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <p className={styles.actor}>
                          <span className={styles.actorLabel}>By</span> {item.actor}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>
          </>,
          document.body,
        )}
    </>
  );
}
