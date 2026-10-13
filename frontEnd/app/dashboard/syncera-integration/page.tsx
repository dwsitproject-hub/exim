import type { Metadata } from "next";
import { Suspense } from "react";
import { SynceraIntegrationPage } from "./SynceraIntegrationPage";

export const metadata: Metadata = {
  title: "Syncera integration",
};

export default function SynceraIntegrationRoute() {
  return (
    <Suspense fallback={<p className="utilLoadingFallback">Loading…</p>}>
      <SynceraIntegrationPage />
    </Suspense>
  );
}
