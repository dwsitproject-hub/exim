"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/overlays";
import { useAuth } from "@/hooks/use-auth";
import { can } from "@/lib/permissions";
import styles from "./CommandPalette.module.css";

interface CommandItem {
  label: string;
  hint?: string;
  onRun: () => void;
}

const MANAGE_USERS = "MANAGE_USERS";

export function CommandPalette() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const baseCommands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      { label: "Go to Dashboard", hint: "/import/dashboard", onRun: () => router.push("/import/dashboard") },
      { label: "Go to Purchase Order list", hint: "/import/po", onRun: () => router.push("/import/po") },
      { label: "Create Purchase Order", hint: "/import/po/new", onRun: () => router.push("/import/po/new") },
      { label: "Go to Shipments list", hint: "/import/shipments", onRun: () => router.push("/import/shipments") },
      { label: "Go to Export dashboard", hint: "/export/dashboard", onRun: () => router.push("/export/dashboard") },
      { label: "Go to Export bulking", hint: "/export/bulking", onRun: () => router.push("/export/bulking") },
      { label: "New export shipment", hint: "/export/bulking?create=1", onRun: () => router.push("/export/bulking?create=1") },
    ];
    if (can(user, MANAGE_USERS)) {
      items.push({ label: "Go to User management", hint: "/admin/users", onRun: () => router.push("/admin/users") });
    }
    return items;
  }, [router, user]);

  const dynamicCommands = useMemo<CommandItem[]>(() => {
    const q = query.trim();
    if (!q) return [];
    return [
      {
        label: `Search PO: ${q}`,
        hint: "/import/po",
        onRun: () => router.push(`/import/po?search=${encodeURIComponent(q)}`),
      },
      {
        label: `Search Shipment: ${q}`,
        hint: "/import/shipments",
        onRun: () => router.push(`/import/shipments?search=${encodeURIComponent(q)}`),
      },
      {
        label: `Search export bulking: ${q}`,
        hint: "/export/bulking",
        onRun: () => router.push(`/export/bulking?search=${encodeURIComponent(q)}`),
      },
    ];
  }, [query, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const staticMatches = q
      ? baseCommands.filter((cmd) => `${cmd.label} ${cmd.hint ?? ""}`.toLowerCase().includes(q))
      : baseCommands;
    if (!q) return staticMatches;
    return [...dynamicCommands, ...staticMatches];
  }, [baseCommands, dynamicCommands, query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function run(cmd: CommandItem) {
    setOpen(false);
    setQuery("");
    cmd.onRun();
  }

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setOpen(true)} aria-label="Open command palette">
        Search
        <span className={styles.kbd}>Ctrl/Cmd+K</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Quick command">
        <input
          className={styles.input}
          type="search"
          placeholder="Type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length > 0) {
              e.preventDefault();
              run(filtered[0]);
            }
          }}
          aria-label="Filter commands"
        />
        <div className={styles.list} role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <p className={styles.empty}>No command found.</p>
          ) : (
            filtered.map((cmd) => (
              <button key={cmd.label} type="button" className={styles.item} onClick={() => run(cmd)}>
                <span>{cmd.label}</span>
                {cmd.hint && <span className={styles.hint}>{cmd.hint}</span>}
              </button>
            ))
          )}
        </div>
      </Modal>
    </>
  );
}

