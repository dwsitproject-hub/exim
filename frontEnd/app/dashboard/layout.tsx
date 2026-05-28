import { AppLayout } from "@/components/layout";
import { GuideTourProvider } from "@/components/guide-tour";

export default function DashboardLayout({
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
