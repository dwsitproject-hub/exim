import { redirect } from "next/navigation";

/** Legacy URL: management content lives on the main dashboard. */
export default function ManagementRedirectPage() {
  redirect("/dashboard");
}
