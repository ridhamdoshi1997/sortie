import { createInsforgeServer } from "@/lib/insforge-server";
import { createAdminDbClient } from "@/lib/admin/client";

export type AdminRole = "owner" | "admin" | "support_readonly";
export type AdminUser = { id: string; userId: string; email: string | null; role: AdminRole };

// Thrown, never redirects internally — this needs to work identically
// inside a Server Component (app/admin/layout.tsx catches it and
// redirects) and inside a Server Action (caught by the action's own
// try/catch, formatted through toUserMessage like every other action in
// this app). A real security gotcha flagged during this feature's
// research: a layout only blocks the UI — it does NOT protect Server
// Actions from being called directly by anyone who knows the payload
// shape. requireAdmin() must be called inside every single admin Server
// Action, not just relied on via the layout.
export class AdminAuthError extends Error {}

export async function requireAdmin(): Promise<AdminUser> {
  const insforge = await createInsforgeServer();
  const { data } = await insforge.auth.getCurrentUser();
  const user = data?.user;
  if (!user) throw new AdminAuthError("Not signed in.");

  const admin = createAdminDbClient();
  const { data: row } = await admin.database
    .from("admin_users")
    .select("id,role")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; role: AdminRole }>();

  if (!row) throw new AdminAuthError("Not authorized.");

  return { id: row.id, userId: user.id, email: user.email ?? null, role: row.role };
}

// Hardcoded per-role capability checks (2026-08-19) — a 3-tier enum with
// checks inline at each call site, not a permission-matrix table. Real
// research (agy) confirmed this is the right size for a 2-5 person team:
// a full RBAC UI would cost more to build than a hardcoded enum ever
// saves at this scale. Call after requireAdmin() — takes its result so
// every gated action only needs one round-trip to the DB, not two.
//
// owner: everything, including managing other admins and the kill switch.
// admin: every day-to-day lever (suspend, usage caps, notes, content) —
//   NOT admin management or the kill switch, both blast-radius-large
//   enough to stay owner-only.
// support_readonly: read-only everywhere — zero write actions, matching
//   "a support person who needs context, not levers."
export function requireRole(admin: AdminUser, allowed: AdminRole[]): void {
  if (!allowed.includes(admin.role)) {
    throw new AdminAuthError(`This action requires ${allowed.join(" or ")} access.`);
  }
}
