"use client";

import type { ReactNode } from "react";
import styles from "./AuthShell.module.css";

export interface AuthShellProps {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {children ? <div className={styles.body}>{children}</div> : null}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>
  );
}

/** Shared link style for auth footers */
export function authBackLinkClassName(): string {
  return styles.backLink;
}

/** Wrapper for inline forgot-password link above submit */
export function authForgotLinkWrapClassName(): string {
  return styles.forgotLinkWrap;
}
