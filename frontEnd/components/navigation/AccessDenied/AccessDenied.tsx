"use client";

import { PageHeader } from "@/components/navigation/PageHeader";
import styles from "./AccessDenied.module.css";

export interface AccessDeniedProps {
  title: string;
  message?: string;
  backHref?: string;
  backLabel?: string;
}

export function AccessDenied({
  title,
  message = "You do not have permission to view this page.",
  backHref,
  backLabel = "Back",
}: AccessDeniedProps) {
  return (
    <section>
      <PageHeader title={title} backHref={backHref} backLabel={backLabel} />
      <p className={styles.message} role="status">
        {message}
      </p>
    </section>
  );
}
