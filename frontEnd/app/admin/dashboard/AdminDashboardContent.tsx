"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Users, Anchor, Briefcase, ClipboardCheck, Boxes, ScanLine } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { can, canAccessAdminArea, canAccessShipperMasterAdmin, canManageExportMasterList } from "@/lib/permissions";
import { LoadingSkeleton } from "@/components/feedback";
import { PageHeader, AccessDenied } from "@/components/navigation";
import styles from "./AdminDashboardContent.module.css";

const MANAGE_USERS = "MANAGE_USERS";
const MANAGE_AGENTS = "MANAGE_AGENTS";
const MANAGE_SURVEYORS = "MANAGE_SURVEYORS";
const MANAGE_COMMODITIES = "MANAGE_COMMODITIES";
const VIEW_PO_PDF_AI_USAGE = "VIEW_PO_PDF_AI_USAGE";

interface AdminConfigItem {
  href: string;
  title: string;
  description: string;
  visible: (user: NonNullable<ReturnType<typeof useAuth>["user"]>) => boolean;
  icon: LucideIcon;
}

const ADMIN_CONFIG_ITEMS: AdminConfigItem[] = [
  {
    href: "/admin/users",
    title: "User management",
    description: "Create users, assign roles, and manage permission overrides.",
    visible: (user) => can(user, MANAGE_USERS),
    icon: Users,
  },
  {
    href: "/admin/shippers",
    title: "Master Shipper",
    description: "Import PT/plant and export shipper/load port master data.",
    visible: (user) => canAccessShipperMasterAdmin(user),
    icon: Anchor,
  },
  {
    href: "/admin/agents",
    title: "Master Agent",
    description: "Maintain agent master data for nominations and documentation.",
    visible: (user) => canManageExportMasterList(user, MANAGE_AGENTS),
    icon: Briefcase,
  },
  {
    href: "/admin/surveyors",
    title: "Master Surveyor",
    description: "Maintain surveyor master data for export bulking nominations.",
    visible: (user) => canManageExportMasterList(user, MANAGE_SURVEYORS),
    icon: ClipboardCheck,
  },
  {
    href: "/admin/commodities",
    title: "Master Commodity",
    description: "Maintain commodity master data for export bulking cargo lines.",
    visible: (user) => canManageExportMasterList(user, MANAGE_COMMODITIES),
    icon: Boxes,
  },
  {
    href: "/admin/po-pdf-ai",
    title: "PO PDF AI usage",
    description: "See who used Rescan with AI and confidence before vs after extraction.",
    visible: (user) => can(user, VIEW_PO_PDF_AI_USAGE),
    icon: ScanLine,
  },
];

export function AdminDashboardContent() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <LoadingSkeleton lines={4} className={styles.loading} />;
  }

  if (!canAccessAdminArea(user)) {
    return (
      <AccessDenied
        title="Administration"
        backHref="/"
        backLabel="Home"
        message="This section is available to administrators only."
      />
    );
  }

  const visibleItems = user ? ADMIN_CONFIG_ITEMS.filter((item) => item.visible(user)) : [];

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
