"use client";

import type { HTMLAttributes } from "react";
import styles from "./ScalingFinancialValue.module.css";

type Props = HTMLAttributes<HTMLSpanElement> & {
  /** Formatted currency string (length drives font size). */
  valueText: string;
};

/**
 * Shrinks display font when the string is long so values stay inside the card without truncation.
 */
export function ScalingFinancialValue({ valueText, className = "", ...rest }: Props) {
  const len = valueText.length;
  const scale =
    len > 20 ? styles.scaleXs : len > 16 ? styles.scaleSm : len > 12 ? styles.scaleMd : styles.scaleLg;

  return (
    <span className={`${styles.root} ${scale} ${className}`.trim()} {...rest}>
      {valueText}
    </span>
  );
}
