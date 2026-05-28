"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/constants";
import { CommandPalette } from "@/components/navigation";
import { useGuideTour } from "@/components/guide-tour";
import { NotificationBell } from "./NotificationBell";
import styles from "./Header.module.css";

export interface HeaderProps {
  /** Called when user taps the mobile menu button (only relevant on small viewports). */
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { startTour } = useGuideTour();

  async function handleLogout() {
    await logout();
    router.push(LOGIN_PATH);
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.menuToggle}
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <span className={styles.menuIcon} aria-hidden />
        </button>
        <Link href="/dashboard" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden>
            <Image
              src="/brand/eos-header-mark.png"
              alt=""
              width={40}
              height={40}
              className={styles.logoMarkImg}
              priority
            />
          </span>
          <span className={styles.logoTextWrap}>
            <span className={styles.logoText}>EOS</span>
            <span className={styles.logoSubtext}>Exim Operation System</span>
          </span>
        </Link>
      </div>
      <nav className={styles.nav} aria-label="User menu">
        <CommandPalette />
        <NotificationBell />
        <button
          type="button"
          className={styles.guideBtn}
          onClick={() => startTour()}
          aria-label="Open page guide"
          title="Page guide"
        >
          <HelpCircle size={22} strokeWidth={2} aria-hidden />
          <span className={styles.guideBtnLabel}>Guide</span>
        </button>
        {user && (
          <span className={styles.user}>
            <span className={styles.userName}>{user.name}</span>
            <button type="button" onClick={handleLogout} className={styles.logout}>
              Log out
            </button>
          </span>
        )}
      </nav>
    </header>
  );
}
