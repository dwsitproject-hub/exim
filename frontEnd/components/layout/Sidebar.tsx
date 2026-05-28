"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ClipboardList,
  Truck,
  Upload,
  Users,
  Ship,
  Package,
  Home,
  ChevronLeft,
  ChevronRight,
  Anchor,
  Briefcase,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import styles from "./Sidebar.module.css";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

type AppSection = "import" | "export" | "admin";

function detectSection(pathname: string): AppSection {
  if (pathname.startsWith("/export")) return "export";
  if (pathname.startsWith("/admin")) return "admin";
  return "import";
}

const IMPORT_NAV: NavItem[] = [
  { href: "/import/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/import/po", label: "Purchase Order", icon: ClipboardList },
  { href: "/import/shipments", label: "Shipments", icon: Truck },
];

const EXPORT_NAV: NavItem[] = [
  { href: "/export/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/export/bulking", label: "Bulking", icon: Ship },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "User management", icon: Users },
  { href: "/admin/shippers", label: "Master Shipper", icon: Anchor },
  { href: "/admin/agents", label: "Master Agent", icon: Briefcase },
];

const SECTION_LABELS: Record<AppSection, string> = {
  import: "Import",
  export: "Export",
  admin: "Admin",
};

const MANAGE_USERS = "MANAGE_USERS";
const IMPORT_PO_CSV = "IMPORT_PO_CSV";
const VIEW_EXPORT_BULKING = "VIEW_EXPORT_BULKING";

function NavLink({
  item,
  isActive,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={`${styles.navItem} ${isActive ? styles.active : ""} ${collapsed ? styles.navItemCollapsed : ""}`}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
    >
      <Icon className={styles.navIcon} size={20} strokeWidth={2} aria-hidden />
      <span className={collapsed ? styles.srOnly : styles.navLabel}>{item.label}</span>
    </Link>
  );
}

export interface SidebarProps {
  isMobileOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function Sidebar({
  isMobileOpen = false,
  onClose,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const section = detectSection(pathname);

  const mainNav = useMemo(() => {
    if (section === "export") {
      return [...EXPORT_NAV];
    }
    if (section === "admin") {
      return [...ADMIN_NAV];
    }
    const items: NavItem[] = [...IMPORT_NAV];
    if (can(user, IMPORT_PO_CSV)) {
      items.push({ href: "/import/monitoring-data", label: "Import Data", icon: Upload });
    }
    return items;
  }, [user, section]);

  useEffect(() => {
    if (isMobileOpen && onClose) onClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps -- close drawer on route change

  const drawerOpen = isMobileOpen;
  const asideClass = `${styles.sidebar} ${drawerOpen ? styles.drawerOpen : ""} ${
    collapsed ? styles.collapsed : ""
  }`;

  const dashboardHref =
    section === "import"
      ? "/import/dashboard"
      : section === "export"
        ? "/export/dashboard"
        : "/admin/dashboard";

  return (
    <aside className={asideClass} aria-label="Main navigation">
      {onToggleCollapsed && (
        <div className={styles.sidebarHeader}>
          {!collapsed && <span className={styles.sidebarHeaderTitle}>{SECTION_LABELS[section]}</span>}
          <button
            type="button"
            className={styles.collapseToggle}
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight size={20} strokeWidth={2} aria-hidden />
            ) : (
              <>
                <ChevronLeft size={20} strokeWidth={2} aria-hidden />
                <span className={styles.collapseToggleText}>Collapse</span>
              </>
            )}
          </button>
        </div>
      )}

      {!collapsed && (
        <Link href="/" className={styles.hubLink} onClick={onClose}>
          <Home size={16} strokeWidth={2} aria-hidden />
          <span>Switch section</span>
        </Link>
      )}

      <nav className={styles.nav} aria-label="Primary">
        <ul className={styles.list}>
          {mainNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== dashboardHref && pathname.startsWith(item.href + "/"));
            return (
              <li key={item.href + item.label}>
                <NavLink
                  item={item}
                  isActive={isActive}
                  collapsed={collapsed}
                  onNavigate={onClose}
                />
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
