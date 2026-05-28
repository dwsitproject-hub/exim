"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/services/notifications-service";
import type { AppNotification } from "@/types/notifications";
import { isApiError } from "@/types/api";
import { can } from "@/lib/permissions";
import styles from "./NotificationBell.module.css";

const POLL_MS = 30_000;

function formatNotifTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function NotificationBell() {
  const router = useRouter();
  const { user, accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const allowed = user ? can(user, "VIEW_SHIPMENTS") : false;

  const refresh = useCallback(() => {
    if (!accessToken || !allowed) return;
    listNotifications(accessToken, { limit: 40, unread_only: false }).then((res) => {
      if (isApiError(res)) return;
      if (Array.isArray(res.data)) setItems(res.data);
      const meta = res.meta as { unread_count?: number } | undefined;
      if (typeof meta?.unread_count === "number") setUnreadCount(meta.unread_count);
    });
  }, [accessToken, allowed]);

  useEffect(() => {
    if (!allowed) return;
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [allowed, refresh]);

  useEffect(() => {
    if (!allowed) return;
    function onFocus() {
      refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [allowed, refresh]);

  if (!user || !allowed) return null;

  async function onClickItem(n: AppNotification) {
    if (!accessToken) return;
    if (!n.read_at) {
      await markNotificationRead(n.id, accessToken);
    }
    setOpen(false);
    if (n.shipment_id) {
      router.push(`/dashboard/shipments/${n.shipment_id}`);
    }
    refresh();
  }

  async function onMarkAll() {
    if (!accessToken) return;
    await markAllNotificationsRead(accessToken);
    refresh();
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) refresh();
        }}
      >
        <Bell size={22} strokeWidth={2} aria-hidden />
        {unreadCount > 0 ? (
          <span className={styles.badge} aria-hidden>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <div className={styles.backdrop} aria-hidden onClick={() => setOpen(false)} />
          <div className={styles.panel} role="dialog" aria-label="Notifications">
            <div className={styles.panelHeader}>
              <span>Notifications</span>
              {items.some((x) => !x.read_at) ? (
                <button type="button" className={styles.markAll} onClick={() => void onMarkAll()}>
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className={styles.list}>
              {items.length === 0 ? (
                <p className={styles.empty}>No notifications yet.</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className={`${styles.item} ${!n.read_at ? styles.itemUnread : ""}`}
                    onClick={() => void onClickItem(n)}
                  >
                    {n.message}
                    <span className={styles.itemTime}>{formatNotifTime(n.created_at)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
