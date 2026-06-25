"use client";

import Link from "next/link";
import { useState } from "react";
import { Input, Button } from "@/components/forms";
import { AuthShell, authBackLinkClassName } from "@/components/auth";
import { Alert } from "@/components/feedback";
import { forgotPassword as forgotPasswordApi } from "@/services/auth-service";
import { useToast } from "@/components/providers/ToastProvider";
import { isApiError } from "@/types/api";
import styles from "./ForgotPasswordForm.module.css";

export function ForgotPasswordForm() {
  const { pushToast } = useToast();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      const res = await forgotPasswordApi(email);
      if (isApiError(res)) {
        const msg = res.message ?? "Request failed";
        setError(msg);
        pushToast(msg, "error");
        if (res.errors?.length) {
          const byField: Record<string, string> = {};
          for (const { field, message } of res.errors) byField[field] = message;
          setFieldErrors(byField);
        }
        return;
      }
      pushToast("If an account exists for this email, you will receive a reset link.", "info");
      setSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Request failed";
      setError(msg);
      pushToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={
          <>
            If an account exists for <strong>{email}</strong>, you will receive a link to reset your password. The
            link expires in 1 hour.
          </>
        }
        footer={
          <Link href="/login" className={authBackLinkClassName()}>
            Back to sign in
          </Link>
        }
      />
    );
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email and we’ll send you a link to reset your password."
      footer={
        <Link href="/login" className={authBackLinkClassName()}>
          Back to sign in
        </Link>
      }
    >
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
        <Button type="submit" fullWidth disabled={loading} className={styles.submit}>
          {loading ? "Sending…" : "Send reset link"}
        </Button>
      </form>
    </AuthShell>
  );
}
