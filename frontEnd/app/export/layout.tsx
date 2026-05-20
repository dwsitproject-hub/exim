import { AppLayout } from "@/components/layout";
import { GuideTourProvider } from "@/components/guide-tour";

export default function ExportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GuideTourProvider>
      <AppLayout>{children}</AppLayout>
    </GuideTourProvider>
  );
}
