"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import styles from "./Button.module.css";
import type { ButtonSize, ButtonVariant } from "./Button";

export interface ButtonLinkProps extends Omit<ComponentProps<typeof Link>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  fullWidth,
  className = "",
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={`${styles.button} ${styles.link} ${styles[variant]} ${size === "sm" ? styles.sm : ""} ${fullWidth ? styles.fullWidth : ""} ${className}`.trim()}
      {...props}
    >
      {children}
    </Link>
  );
}
