"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { logAdminAction } from "@/lib/admin/audit";
import {
  getAppSettings,
  getSignupsOverTime,
  getTopUsersByUsage,
  getTotalUserCount,
  getUsageOverTime,
  getUserDetail,
  getAdminNotes,
  listUsers,
  type UserListPage,
  type UserDetail,
  type AdminNoteRow,
} from "@/lib/admin/queries";
import { toUserMessage } from "@/lib/errors";

type ActionResult = { success: true } | { success: false; error: string };

// requireAdmin() is called inside this action itself, not just relied on
// via app/admin/layout.tsx — a layout only blocks the UI, it doesn't stop
// this action from being invoked directly by anyone who knows its shape
// (a real gotcha flagged during this feature's research).
export async function setUserSuspended(targetUserId: string, suspend: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const client = createAdminDbClient();

    const { data: before } = await client.database
      .from("profiles")
      .select("is_suspended")
      .eq("id", targetUserId)
      .maybeSingle<{ is_suspended: boolean }>();

    const { error } = await client.database.from("profiles").update({ is_suspended: suspend }).eq("id", targetUserId);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to update this user.") };
    }

    await logAdminAction(admin, {
      action: suspend ? "suspend_user" : "unsuspend_user",
      targetUserId,
      targetTable: "profiles",
      targetId: targetUserId,
      before: { is_suspended: before?.is_suspended ?? false },
      after: { is_suspended: suspend },
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;

async function getAdminDashboardData() {
  const [topUsers, signups, usage, totalUsers, appSettings] = await Promise.all([
    getTopUsersByUsage(20),
    getSignupsOverTime(14),
    getUsageOverTime(14),
    getTotalUserCount(),
    getAppSettings(),
  ]);

  return { topUsers, signups, usage, totalUsers, appSettings };
}

// The global kill switch — no exceptions, deliberately (see lib/usage.ts's
// checkAndConsumeUsage comment on why even ADMIN_EMAILS accounts get
// blocked when this is off). A real operational lever for a runaway-bug
// or bot-spam scenario, not a per-user tool.
export async function setAiEnabled(enabled: boolean, reason: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const client = createAdminDbClient();

    const before = await getAppSettings();

    const { error } = await client.database
      .from("app_settings")
      .update({
        ai_enabled: enabled,
        ai_disabled_reason: enabled ? null : reason || null,
        updated_by: admin.id,
      })
      .eq("id", 1);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to update the AI kill switch.") };
    }

    await logAdminAction(admin, {
      action: enabled ? "enable_ai" : "disable_ai",
      targetTable: "app_settings",
      before: { ai_enabled: before.aiEnabled },
      after: { ai_enabled: enabled, reason: enabled ? null : reason || null },
    });

    revalidatePath("/admin");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function setUsageMultiplier(targetUserId: string, multiplier: number): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const client = createAdminDbClient();

    const { data: before } = await client.database
      .from("profiles")
      .select("custom_usage_multiplier")
      .eq("id", targetUserId)
      .maybeSingle<{ custom_usage_multiplier: number }>();

    const { error } = await client.database
      .from("profiles")
      .update({ custom_usage_multiplier: multiplier })
      .eq("id", targetUserId);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to update this user's usage multiplier.") };
    }

    await logAdminAction(admin, {
      action: "set_usage_multiplier",
      targetUserId,
      targetTable: "profiles",
      targetId: targetUserId,
      before: { custom_usage_multiplier: before?.custom_usage_multiplier ?? 1 },
      after: { custom_usage_multiplier: multiplier },
    });

    revalidatePath(`/admin/users/${targetUserId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function addAdminNote(targetUserId: string, note: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const client = createAdminDbClient();

    if (!note.trim()) {
      return { success: false, error: "Note can't be empty." };
    }

    const { error } = await client.database
      .from("admin_notes")
      .insert([{ user_id: targetUserId, admin_user_id: admin.id, note: note.trim() }]);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to save this note.") };
    }

    await logAdminAction(admin, {
      action: "add_note",
      targetUserId,
      targetTable: "admin_notes",
      note: note.trim(),
    });

    revalidatePath(`/admin/users/${targetUserId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type UsersPageResult = { success: true; data: UserListPage } | { success: false; error: string };

export async function getUsersPage(page: number, search: string): Promise<UsersPageResult> {
  try {
    await requireAdmin();
    const data = await listUsers(page, search);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type UserDetailPageResult =
  | { success: true; detail: UserDetail; notes: AdminNoteRow[] }
  | { success: false; error: string };

export async function getUserDetailPage(targetUserId: string): Promise<UserDetailPageResult> {
  try {
    await requireAdmin();
    const [detail, notes] = await Promise.all([getUserDetail(targetUserId), getAdminNotes(targetUserId)]);
    if (!detail) {
      return { success: false, error: "User not found." };
    }
    return { success: true, detail, notes };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type DashboardResult = { success: true; data: AdminDashboardData } | { success: false; error: string };

export async function getAdminDashboard(): Promise<DashboardResult> {
  try {
    await requireAdmin();
    const data = await getAdminDashboardData();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}
