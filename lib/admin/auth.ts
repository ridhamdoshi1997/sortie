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
