import { Suspense } from "react";
import { ExportBulkingDetail } from "./ExportBulkingDetail";
import { LoadingSkeleton } from "@/components/feedback";

export default function ExportBulkingDetailPage() {
  return (
    <Suspense fallback={<LoadingSkeleton lines={8} />}>
      <ExportBulkingDetail />
    </Suspense>
  );
}
