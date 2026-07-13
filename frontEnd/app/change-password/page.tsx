import { Suspense } from "react";
import { ChangePasswordForm } from "./ChangePasswordForm";

export default function ChangePasswordPage() {
  return (
    <main aria-label="Change password">
      <Suspense fallback={<p className="utilLoadingFallback">Loading…</p>}>
        <ChangePasswordForm />
      </Suspense>
    </main>
  );
}
