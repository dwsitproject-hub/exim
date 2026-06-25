"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Input, Button } from "@/components/forms";
import { AuthShell, authBackLinkClassName, authForgotLinkWrapClassName } from "@/components/auth";
import { Alert } from "@/components/feedback";
import { DEFAULT_AFTER_LOGIN_PATH } from "@/lib/constants";
import { useToast } from "@/components/providers/ToastProvider";
import styles from "./LoginForm.module.css";

export function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? DEFAULT_AFTER_LOGIN_PATH;
  const { user, initialized, login, loading } = useAuth();
  const { pushToast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialized && user) {
      window.location.replace(from);
    }
  }, [initialized, user, from]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const result = await login(email, password);
    if (result.ok) {
      pushToast("Signed in successfully.", "success");
      window.location.href = from;
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
    </AuthShell>
  );
}
