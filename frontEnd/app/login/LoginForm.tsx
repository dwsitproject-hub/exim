"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Input, Button } from "@/components/forms";
import { AuthShell, authBackLinkClassName, authForgotLinkWrapClassName } from "@/components/auth";
import { Alert } from "@/components/feedback";
import { DEFAULT_AFTER_LOGIN_PATH, CHANGE_PASSWORD_PATH } from "@/lib/constants";
import { useToast } from "@/components/providers/ToastProvider";
import { getOidcStatus, oidcLoginUrl } from "@/services/auth-service";
import styles from "./LoginForm.module.css";

export function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? DEFAULT_AFTER_LOGIN_PATH;
  const ssoError = searchParams.get("sso_error");
  const { user, initialized, login, loading } = useAuth();
  const { pushToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [oidcEnabled, setOidcEnabled] = useState(false);

  useEffect(() => {
    if (initialized && user) {
      window.location.replace(user.must_change_password ? CHANGE_PASSWORD_PATH : from);
    }
  }, [initialized, user, from]);

  useEffect(() => {
    if (ssoError) {
      setError(ssoError);
      pushToast(ssoError, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- surface once on mount / param change
  }, [ssoError]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getOidcStatus();
        if (!cancelled && res.success && res.data?.enabled) {
          setOidcEnabled(true);
        }
      } catch {
        /* SSO button stays hidden if status unavailable */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const result = await login(email, password);
    if (result.ok) {
      pushToast(
        result.user?.must_change_password ? "Please set a new password to continue." : "Signed in successfully.",
        "success"
      );
      window.location.href = result.user?.must_change_password ? CHANGE_PASSWORD_PATH : from;
      return;
    }
    const errMsg = result.error ?? "Login failed";
    pushToast(errMsg, "error");
    setError(errMsg);
    if (result.errors?.length) {
      const byField: Record<string, string> = {};
      for (const { field, message } of result.errors) byField[field] = message;
      setFieldErrors(byField);
    }
  }

  function handleOidcLogin() {
    window.location.href = oidcLoginUrl();
  }

  return (
    <AuthShell title="Log in" subtitle="Sign in to EOS — Exim Operation System">
      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <Alert>{error}</Alert>}
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          error={fieldErrors.email}
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          error={fieldErrors.password}
        />
        <p className={authForgotLinkWrapClassName()}>
          <Link href="/forgot-password" className={authBackLinkClassName()}>
            Forgot password?
          </Link>
        </p>
        <Button type="submit" fullWidth disabled={loading} className={styles.submit}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      {oidcEnabled && (
        <div className={styles.ssoBlock}>
          <div className={styles.ssoDivider} role="separator">
            <span>or</span>
          </div>
          <Button type="button" variant="outline" fullWidth onClick={handleOidcLogin}>
            Sign in with DWS Hub
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
