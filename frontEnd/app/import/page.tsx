import { redirect } from "next/navigation";

/** /import → import module dashboard (alias for /import/dashboard). */
export default function ImportIndexPage() {
  redirect("/import/dashboard");
}
