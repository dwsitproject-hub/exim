"use client";

import type { HTMLAttributes } from "react";
import styles from "./Alert.module.css";

export type AlertVariant = "error" | "warning" | "info" | "success";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
}

export function Alert({ variant = "error", title, children, className = "", ...props }: AlertProps) {
  return (
    <div
      className={`${styles.alert} ${styles[variant]} ${className}`.trim()}
      role="alert"
      {...props}
    >
      {title ? <span className={styles.title}>{title}</span> : null}
      {children}
    </div>
  );
}
