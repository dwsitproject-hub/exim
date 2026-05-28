"use client";

import { useContext } from "react";
import type { TooltipRenderProps } from "react-joyride";
import { GuideTourCheckboxContext } from "./GuideTourProvider";
import styles from "./GuideTourTooltip.module.css";

export function GuideTourTooltip(props: TooltipRenderProps) {
  const { backProps, index, isLastStep, primaryProps, skipProps, step, tooltipProps, size } = props;
  const checkboxCtx = useContext(GuideTourCheckboxContext);

  const showBack = index > 0;
  const progress = size > 0 ? `${index + 1} / ${size}` : "";

  return (
    <div {...tooltipProps} className={styles.tooltip}>
      <div className={styles.header}>
        {step.title ? <h3 className={styles.title}>{step.title}</h3> : null}
        {progress ? <span className={styles.progress}>{progress}</span> : null}
      </div>
      <div className={styles.body}>{step.content}</div>
      {isLastStep && checkboxCtx ? (
        <label className={styles.dontShow}>
          <input
            type="checkbox"
            checked={checkboxCtx.dontShowAgain}
            onChange={(e) => checkboxCtx.setDontShowAgain(e.target.checked)}
          />
          <span>Don&apos;t show this again</span>
        </label>
      ) : null}
      <div className={styles.footer}>
        <button type="button" {...skipProps} className={styles.btnSkip}>
          Skip
        </button>
        <div className={styles.footerRight}>
          {showBack ? (
            <button type="button" {...backProps} className={styles.btnBack}>
              Back
            </button>
          ) : null}
          <button type="button" {...primaryProps} className={styles.btnPrimary}>
            {isLastStep ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
