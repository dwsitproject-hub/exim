import type { Metadata } from "next";
import { Suspense } from "react";
import { MonitoringDataPage } from "./MonitoringDataPage";

export const metadata: Metadata = {
  title: "Import Data",
};

export default function MonitoringDataRoute() {
  return (
    <Suspense fallback={<p className="utilLoadingFallback">Loading…</p>}>
      <MonitoringDataPage />
    </Suspense>
  );
}
