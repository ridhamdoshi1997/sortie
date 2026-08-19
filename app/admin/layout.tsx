import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin/auth";

// The gate. Deliberately silent — redirects to "/" rather than a
// "you're not authorized" page, so /admin's existence isn't advertised to
// a logged-in-but-not-admin user. Server Actions under /admin still call
// requireAdmin() themselves (actions/admin.ts) — a layout only blocks the
// rendered UI, it doesn't stop a Server Action from being invoked directly.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      <header className="border-b border-border bg-surface px-4 py-4 sm:px-6 lg:px-8">
        <p className="text-sm font-semibold text-text-primary">Sortie Admin</p>
      </header>
      <main className="mx-auto max-w-360 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
