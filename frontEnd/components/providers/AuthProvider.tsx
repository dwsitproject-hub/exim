"use client";

import { AuthProvider as AuthProviderInner } from "@/hooks/use-auth";
import { PasswordChangeGate } from "@/components/auth/PasswordChangeGate";
import { ToastProvider } from "./ToastProvider";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthProviderInner>
      <PasswordChangeGate>
        <ToastProvider>{children}</ToastProvider>
      </PasswordChangeGate>
    </AuthProviderInner>
  );
}
