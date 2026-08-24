import { redirect } from "next/navigation";

import { requireAdmin, AdminAuthError } from "@/lib/admin/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminNavigatorLauncherLoader } from "@/components/admin/AdminNavigatorLauncherLoader";

// The gate. Server Actions under /admin still call requireAdmin() themselves
// (actions/admin.ts) — a layout only blocks the rendered UI, it doesn't stop
// a Server Action from being invoked directly.
//
// Two distinct failure modes, two distinct redirects (2026-08-19, direct
// user request) — requireAdmin() throws a different message for each so
// this doesn't need its own session check:
// - Not signed in at all -> /login, so the person can actually get in.
// - Signed in but not an admin -> /dashboard, not /login (redirecting an
//   already-authenticated person to a login screen is confusing — they'd
//   just bounce right back in). This also doesn't silently advertise
//   /admin's existence any more than /dashboard already does for a
//   logged-in user, so the original "don't reveal this route" reasoning
//   still holds without needing to send them to a sign-in screen they
//   don't need.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AdminAuthError && error.message === "Not signed in.") {
      redirect("/login");
    }
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen bg-surface-secondary">
      <AdminSidebar />
      <main className="mx-auto w-full min-w-0 max-w-360 flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      <AdminNavigatorLauncherLoader />
    </div>
  );
}
