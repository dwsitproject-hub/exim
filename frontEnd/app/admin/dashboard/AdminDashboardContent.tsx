"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Users, Anchor, Briefcase, ScanLine } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { can, isAdminRole } from "@/lib/permissions";
import { LoadingSkeleton } from "@/components/feedback";
import { PageHeader } from "@/components/navigation";
import styles from "./AdminDashboardContent.module.css";

const MANAGE_USERS = "MANAGE_USERS";
const MANAGE_SHIPPERS = "MANAGE_SHIPPERS";
const MANAGE_AGENTS = "MANAGE_AGENTS";
const VIEW_PO_PDF_AI_USAGE = "VIEW_PO_PDF_AI_USAGE";

interface AdminConfigItem {
  href: string;
  title: string;
  description: string;
  permission: string;
  icon: LucideIcon;
}

const ADMIN_CONFIG_ITEMS: AdminConfigItem[] = [
  {
    href: "/admin/users",
    title: "User management",
    description: "Create users, assign roles, and manage permission overrides.",
    permission: MANAGE_USERS,
    icon: Users,
  },
  {
    href: "/admin/shippers",
    title: "Master Shipper",
    description: "Maintain shipper master data used across export operations.",
    permission: MANAGE_SHIPPERS,
    icon: Anchor,
  },
  {
    href: "/admin/agents",
    title: "Master Agent",
    description: "Maintain agent master data for nominations and documentation.",
    permission: MANAGE_AGENTS,
    icon: Briefcase,
  },
  {
    href: "/admin/po-pdf-ai",
    title: "PO PDF AI usage",
    description: "See who used Rescan with AI and confidence before vs after extraction.",
    permission: VIEW_PO_PDF_AI_USAGE,
    icon: ScanLine,
  },
];

export function AdminDashboardContent() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <LoadingSkeleton lines={4} className={styles.loading} />;
  }

  if (!isAdminRole(user)) {
    return (
      <section>
        <PageHeader title="Administration" backHref="/" backLabel="Home" />
        <p className={styles.denied}>This section is available to administrators only.</p>
      </section>
    );
  }

  const visibleItems = ADMIN_CONFIG_ITEMS.filter((item) => can(user, item.permission));

  return (
    <section>
      <PageHeader
        title="Administration"
        subtitle={user ? `Welcome, ${user.name}. Choose a configuration area.` : undefined}
        backHref="/"
        backLabel="Home"
      />

      {visibleItems.length === 0 ? (
        <p className={styles.empty}>No configuration areas are available for your account.</p>
      ) : (
        <div className={styles.cardGrid}>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={styles.configCard}>
                <Icon size={28} strokeWidth={2} aria-hidden />
                <div>
                  <span className={styles.configCardTitle}>{item.title}</span>
                  <span className={styles.configCardDesc}>{item.description}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
