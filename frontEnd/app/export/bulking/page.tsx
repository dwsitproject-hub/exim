import { Suspense } from "react";
import { ExportBulkingList } from "./ExportBulkingList";
import { LoadingSkeleton } from "@/components/feedback";

export default function ExportBulkingPage() {
  return (
    <Suspense fallback={<LoadingSkeleton lines={6} />}>
      <ExportBulkingList />
    </Suspense>
  );
}
