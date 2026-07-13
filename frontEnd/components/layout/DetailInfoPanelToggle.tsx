"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSessionPersistedState } from "@/hooks/use-session-persisted-state";
import styles from "./DetailInfoPanelToggle.module.css";

export type DetailInfoPanelToggleProps = {
  open: boolean;
  onToggle: () => void;
  panelId: string;
  /** Shown beside the chevron when the panel is collapsed. */
  collapsedLabel?: string;
};

export function DetailInfoPanelToggle({
  open,
  onToggle,
  panelId,
  collapsedLabel = "Summary",
}: DetailInfoPanelToggleProps) {
  const [discovered, setDiscovered] = useSessionPersistedState(
    "eos-detail-info-panel-toggle-discovered",
    false,
  );

  const handleClick = () => {
    if (!discovered) setDiscovered(true);
    onToggle();
  };

  const showAttention = !open && !discovered;

  return (
    <button
      type="button"
      className={[
        styles.toggle,
        open ? styles.toggleOpen : styles.toggleCollapsed,
        showAttention ? styles.toggleAttention : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={handleClick}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={open ? "Collapse information panel" : `Show ${collapsedLabel.toLowerCase()} panel`}
      title={open ? "Hide summary panel" : `Show ${collapsedLabel.toLowerCase()} panel`}
    >
      {open ? (
        <ChevronRight size={16} aria-hidden />
      ) : (
        <>
          <span className={styles.label}>{collapsedLabel}</span>
          <ChevronLeft size={16} aria-hidden />
        </>
      )}
    </button>
  );
}
