"use client";

import Link from "next/link";
import styles from "./PageHeader.module.css";

export interface PageHeaderProps {
  title: string;
  /** Renders inline to the right of the title (e.g. status badge). */
  titleAddon?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  sticky?: boolean;
}

export function PageHeader({
  title,
  titleAddon,
  backHref,
  backLabel = "Back",
  actions,
  subtitle,
  breadcrumbs,
  sticky = false,
}: PageHeaderProps) {
  const showTopRow = backHref || actions;

  return (
    <header className={`${styles.header} ${sticky ? styles.sticky : ""}`.trim()}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          {breadcrumbs.map((item, idx) => (
            <span key={`${item.label}-${idx}`} className={styles.crumb}>
              {item.href ? (
                <Link href={item.href} className={styles.crumbLink}>
                  {item.label}
                </Link>
              ) : (
                <span className={styles.crumbCurrent}>{item.label}</span>
              )}
              {idx < breadcrumbs.length - 1 && <span className={styles.crumbSep}>/</span>}
            </span>
          ))}
        </nav>
      )}
      {showTopRow && (
        <div className={styles.topRow}>
          {backHref ? (
            <Link href={backHref} className={styles.backLink}>
              ← {backLabel}
            </Link>
          ) : (
            <span />
          )}
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      <div className={styles.titleBlock}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {titleAddon ? <div className={styles.titleAddon}>{titleAddon}</div> : null}
        </div>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
    </header>
  );
}
