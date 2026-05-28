"use client";

/**
 * App layout for protected areas — top header + left sidebar + main content.
 * Sidebar is persistent on desktop; on viewports < 1024px it becomes a drawer toggled by the header menu button.
 * Desktop: sidebar can collapse to an icon rail (toggle at top of sidebar).
 */

import { useState, useCallback, useEffect } from "react";
import { MainLayout } from "./MainLayout";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import styles from "./AppLayout.module.css";

const SIDEBAR_COLLAPSED_KEY = "eos-sidebar-collapsed";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const openMenu = useCallback(() => setMobileMenuOpen(true), []);
  const closeMenu = useCallback(() => setMobileMenuOpen(false), []);
  const toggleSidebarCollapsed = useCallback(() => setSidebarCollapsed((c) => !c), []);

  return (
    <div className={styles.wrapper}>
      <Header onMenuClick={openMenu} />
      <div className={styles.body}>
        <Sidebar
          isMobileOpen={mobileMenuOpen}
          onClose={closeMenu}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
        />
        {mobileMenuOpen && (
          <div
            className={styles.overlay}
            onClick={closeMenu}
            aria-hidden="true"
          />
        )}
        <MainLayout>{children}</MainLayout>
      </div>
    </div>
  );
}
