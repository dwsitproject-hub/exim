"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowDownLeft, ArrowUpRight, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { isAdminRole } from "@/lib/permissions";
import { LOGIN_PATH } from "@/lib/constants";
import styles from "./page.module.css";

export default function HubPage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <main className={styles.main}>
        <h1 className={styles.title}>Exim Operation System (EOS)</h1>
        <p className={styles.subtitle}>Redirecting&hellip;</p>
        <nav className={styles.nav}>
          <Link href={LOGIN_PATH}>Log in</Link>
        </nav>
      </main>
    );
  }

  const showAdminCard = isAdminRole(user);

  return (
    <main className={styles.hubMain}>
      <div className={styles.hubHeader}>
        <Image
          src="/brand/eos-header-mark.png"
          alt=""
          width={48}
          height={48}
          priority
        />
        <div>
          <h1 className={styles.hubTitle}>EOS</h1>
          <p className={styles.hubSubtitle}>Exim Operation System</p>
        </div>
      </div>
      <p className={styles.hubWelcome}>Welcome, {user.name}. Choose a section to continue.</p>
      <div className={styles.hubCards}>
        <Link href="/import/dashboard" className={styles.hubCard}>
          <ArrowDownLeft size={28} strokeWidth={2} aria-hidden />
          <div>
            <span className={styles.hubCardTitle}>Import</span>
            <span className={styles.hubCardDesc}>
              PO intake, shipments, duty tracking, and documents.
            </span>
          </div>
        </Link>
        <Link href="/export/dashboard" className={styles.hubCard}>
          <ArrowUpRight size={28} strokeWidth={2} aria-hidden />
          <div>
            <span className={styles.hubCardTitle}>Export</span>
            <span className={styles.hubCardDesc}>
              Bulking, shipping instructions, invoices, and packing lists.
            </span>
          </div>
        </Link>
        {showAdminCard && (
          <Link href="/admin/dashboard" className={styles.hubCard}>
            <Settings size={28} strokeWidth={2} aria-hidden />
            <div>
              <span className={styles.hubCardTitle}>Admin</span>
              <span className={styles.hubCardDesc}>
                Users, master shippers, agents, and system configuration.
              </span>
            </div>
          </Link>
        )}
      </div>
    </main>
  );
}
