"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { CHANGE_PASSWORD_PATH, LOGIN_PATH } from "@/lib/constants";

const EXEMPT_PATHS = new Set([CHANGE_PASSWORD_PATH, LOGIN_PATH, "/forgot-password", "/reset-password"]);

export function PasswordChangeGate({ children }: { children: React.ReactNode }) {
  const { user, initialized } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!initialized || !user?.must_change_password) return;
    if (EXEMPT_PATHS.has(pathname)) return;
    router.replace(CHANGE_PASSWORD_PATH);
  }, [initialized, user, pathname, router]);

  return <>{children}</>;
}
