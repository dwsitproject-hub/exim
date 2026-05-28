import { redirect } from "next/navigation";

/** Analytics lives on the main dashboard (same section as former “Delivered shipments”). */
export default function AnalyticsRedirectPage() {
  redirect("/dashboard");
}
