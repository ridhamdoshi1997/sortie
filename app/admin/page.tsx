import { redirect } from "next/navigation";

import { getAdminDashboard } from "@/actions/admin";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

// Real-time data, not Next's default cache — an admin checking who's
// burning the shared AI rate limit right now needs live numbers, not a
// stale cached render (a real gotcha flagged during this feature's design).
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const result = await getAdminDashboard();
  if (!result.success) {
    redirect("/");
  }

  return <AdminDashboard initialData={result.data} />;
}
