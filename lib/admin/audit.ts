import { createAdminDbClient } from "@/lib/admin/client";
import type { AdminUser } from "@/lib/admin/auth";

type AuditParams = {
  action: string;
  targetUserId?: string;
  targetTable?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  note?: string;
};

// Fire-and-forget, same resilience pattern as the rest of this app (e.g.
// getQuestionDetails' cache-write failure) — a transient audit-log write
// failure must never block the actual admin action (an admin needs to be
// able to suspend a runaway-usage abuser even if logging hiccups), it just
// gets a console.error so it's visible in `insforge diagnose logs`.
export async function logAdminAction(admin: AdminUser, params: AuditParams): Promise<void> {
  const client = createAdminDbClient();
  const { error } = await client.database.from("admin_audit_log").insert([
    {
      admin_user_id: admin.id,
      action: params.action,
      target_user_id: params.targetUserId ?? null,
      target_table: params.targetTable ?? null,
      target_id: params.targetId ?? null,
      before: params.before ?? null,
      after: params.after ?? null,
      note: params.note ?? null,
    },
  ]);

  if (error) {
    console.error("[lib/admin/audit] logAdminAction", error);
  }
}
