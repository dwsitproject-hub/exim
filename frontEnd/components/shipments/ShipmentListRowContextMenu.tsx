"use client";

import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import styles from "./ShipmentListRowContextMenu.module.css";

type MenuState = { x: number; y: number; href: string } | null;

export function useShipmentListRowContextMenu() {
  const [menu, setMenu] = useState<MenuState>(null);

  const closeRowContextMenu = useCallback(() => setMenu(null), []);

  const openRowContextMenu = useCallback((e: MouseEvent, href: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, href });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const dismiss = () => closeRowContextMenu();
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeRowContextMenu();
    };
    document.addEventListener("click", dismiss);
    document.addEventListener("scroll", dismiss, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu, closeRowContextMenu]);

  const openInNewTab = useCallback(() => {
    if (!menu) return;
    window.open(menu.href, "_blank", "noopener,noreferrer");
    closeRowContextMenu();
  }, [menu, closeRowContextMenu]);

  const rowContextMenu: ReactNode = menu ? (
    <div
      className={styles.menu}
      style={{ top: menu.y, left: menu.x }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" className={styles.menuItem} role="menuitem" onClick={openInNewTab}>
        Open in new tab
      </button>
    </div>
  ) : null;

  return { openRowContextMenu, rowContextMenu };
}
