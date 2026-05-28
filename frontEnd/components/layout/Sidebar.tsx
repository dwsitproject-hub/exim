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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import styles from "./Sidebar.module.css";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const BASE_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/po", label: "Purchase Order", icon: ClipboardList },
  { href: "/dashboard/shipments", label: "Shipments", icon: Truck },
];

const MANAGE_USERS = "MANAGE_USERS";
const IMPORT_PO_CSV = "IMPORT_PO_CSV";

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
  /** When true (and viewport is mobile), drawer is visible. */
  isMobileOpen?: boolean;
  /** Called when drawer should close (e.g. overlay click, or after navigation). */
  onClose?: () => void;
  /** Desktop: narrow icon-only rail. */
  collapsed?: boolean;
  /** Desktop: toggle collapse. */
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

  const mainNav = useMemo(() => {
    const items: NavItem[] = [...BASE_NAV];
    if (can(user, IMPORT_PO_CSV)) {
      items.push({ href: "/dashboard/monitoring-data", label: "Import Data", icon: Upload });
    }
    if (can(user, MANAGE_USERS)) {
      items.push({ href: "/dashboard/users", label: "User management", icon: Users });
    }
    return items;
  }, [user]);

  useEffect(() => {
    if (isMobileOpen && onClose) onClose();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps -- close drawer on route change

  const drawerOpen = isMobileOpen;
  const asideClass = `${styles.sidebar} ${drawerOpen ? styles.drawerOpen : ""} ${
    collapsed ? styles.collapsed : ""
  }`;

  return (
    <aside className={asideClass} aria-label="Main navigation">
      {onToggleCollapsed && (
        <div className={styles.sidebarHeader}>
          {!collapsed && <span className={styles.sidebarHeaderTitle}>Menu</span>}
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
      <nav className={styles.nav} aria-label="Primary">
        <ul className={styles.list}>
          {mainNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
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
