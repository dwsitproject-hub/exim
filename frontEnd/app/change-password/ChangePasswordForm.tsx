"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Input, Button } from "@/components/forms";
import { AuthShell } from "@/components/auth";
import { Alert } from "@/components/feedback";
import { useAuth } from "@/hooks/use-auth";
import { changePassword as changePasswordApi } from "@/services/auth-service";
import { useToast } from "@/components/providers/ToastProvider";
import { isApiError } from "@/types/api";
import { CHANGE_PASSWORD_PATH, DEFAULT_AFTER_LOGIN_PATH, LOGIN_PATH } from "@/lib/constants";
import { getPostOnboardingPath } from "@/lib/export-bulking-onboarding";
import { markFirstTimeUser } from "@/lib/first-time-user-storage";
import styles from "../reset-password/ResetPasswordForm.module.css";

export function ChangePasswordForm() {
  const router = useRouter();
  const { user, initialized, logout, refreshSession } = useAuth();
  const { pushToast } = useToast();
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!initialized) return;
    if (!user) {
      router.replace(`${LOGIN_PATH}?from=${encodeURIComponent(CHANGE_PASSWORD_PATH)}`);
      return;
    }
    if (!user.must_change_password) {
      router.replace(DEFAULT_AFTER_LOGIN_PATH);
    }
  }, [initialized, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      const res = await changePasswordApi({
        new_password: newPassword,
        password_confirmation: passwordConfirmation,
      });
      if (isApiError(res)) {
        const msg = res.message ?? "Password change failed";
        setError(msg);
        pushToast(msg, "error");
        if (res.errors?.length) {
          const byField: Record<string, string> = {};
          for (const { field, message } of res.errors) byField[field] = message;
          setFieldErrors(byField);
        }
        return;
      }
      await refreshSession();
      if (user?.id) {
        markFirstTimeUser(user.id);
      }
      pushToast("Password updated. Welcome to EOS.", "success");
      router.replace(getPostOnboardingPath(user?.role));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Password change failed";
      setError(msg);
      pushToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  if (!initialized || !user) {
    return <p className="utilLoadingFallback">Loading…</p>;
  }

  return (
    <AuthShell
      title="Set your password"
      subtitle="You signed in with a temporary password. Choose a new password to continue."
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <Alert>{error}</Alert>}
        <Input
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
          placeholder="At least 8 characters"
          error={fieldErrors.new_password}
        />
        <Input
          label="Confirm new password"
          type="password"
          value={passwordConfirmation}
          onChange={(e) => setPasswordConfirmation(e.target.value)}
          required
          autoComplete="new-password"
          placeholder="Repeat new password"
          error={fieldErrors.password_confirmation}
        />
        <Button type="submit" fullWidth disabled={loading} className={styles.submit}>
          {loading ? "Saving…" : "Save new password"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          fullWidth
          onClick={() => void logout().then(() => router.replace(LOGIN_PATH))}
        >
          Sign out
        </Button>
      </form>
    </AuthShell>
  );
}
