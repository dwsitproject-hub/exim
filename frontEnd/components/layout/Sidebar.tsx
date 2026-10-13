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
  ScanLine,
  ChevronLeft,
  ChevronRight,
  Radio,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import type { AuthUser } from "@/types/auth";
import styles from "./Sidebar.module.css";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const OVERVIEW_NAV: NavItem[] = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }];

const OPERATIONS_NAV: NavItem[] = [
  { href: "/dashboard/po", label: "Purchase Order", icon: ClipboardList },
  { href: "/dashboard/shipments", label: "Shipments", icon: Truck },
];

const MANAGE_USERS = "MANAGE_USERS";
const IMPORT_PO_CSV = "IMPORT_PO_CSV";
const VIEW_PO_INTAKE = "VIEW_PO_INTAKE";
const VIEW_PO_PDF_AI_USAGE = "VIEW_PO_PDF_AI_USAGE";

function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
}

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

function buildNavGroups(user: AuthUser | null | undefined): NavGroup[] {
  const groups: NavGroup[] = [
    { id: "overview", label: "Overview", items: [...OVERVIEW_NAV] },
    { id: "operations", label: "Operations", items: [...OPERATIONS_NAV] },
  ];

  const importItems: NavItem[] = [];
  if (can(user, VIEW_PO_INTAKE)) {
    importItems.push({
      href: "/dashboard/syncera-integration",
      label: "Syncera integration",
      icon: Radio,
    });
  }
  if (can(user, IMPORT_PO_CSV)) {
    importItems.push({ href: "/dashboard/monitoring-data", label: "Import Data", icon: Upload });
  }
  if (importItems.length > 0) {
    groups.push({ id: "import", label: "Import & integration", items: importItems });
  }

  const adminItems: NavItem[] = [];
  if (can(user, MANAGE_USERS)) {
    adminItems.push({ href: "/dashboard/users", label: "User management", icon: Users });
  }
  if (can(user, VIEW_PO_PDF_AI_USAGE)) {
    adminItems.push({ href: "/admin/po-pdf-ai", label: "PO PDF AI usage", icon: ScanLine });
  }
  if (adminItems.length > 0) {
    groups.push({ id: "admin", label: "Administration", items: adminItems });
  }

  return groups;
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

  const navGroups = useMemo(() => buildNavGroups(user), [user]);

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
        {navGroups.map((group, groupIndex) => (
          <section
            key={group.id}
            className={styles.navGroup}
            aria-labelledby={collapsed ? undefined : `nav-group-${group.id}`}
          >
            {!collapsed ? (
              <h2 id={`nav-group-${group.id}`} className={styles.navGroupLabel}>
                {group.label}
              </h2>
            ) : groupIndex > 0 ? (
              <div className={styles.navGroupDivider} role="presentation" aria-hidden />
            ) : null}
            <ul className={styles.list}>
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink
                    item={item}
                    isActive={isNavItemActive(pathname, item.href)}
                    collapsed={collapsed}
                    onNavigate={onClose}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </aside>
  );
}
