"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireRole, type AdminRole } from "@/lib/admin/auth";
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
  listAdmins,
  type UserListPage,
  type UserDetail,
  type AdminNoteRow,
  type AdminRosterRow,
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
    requireRole(admin, ["owner", "admin"]);
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
    requireRole(admin, ["owner"]);
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
    requireRole(admin, ["owner", "admin"]);
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
    requireRole(admin, ["owner", "admin"]);
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

// Team & Roles (2026-08-19, direct user request) — hardcoded owner-only
// gate, not a permission-matrix UI. "Invite" is really "grant an existing
// account admin access" — InsForge auth requires a real signed-up account
// to exist first, there's no separate invitation-email flow in v1 (matches
// the "hours, not multi-day" complexity estimate from real research).
type AdminRosterResult =
  | { success: true; admins: AdminRosterRow[]; viewerRole: AdminRole }
  | { success: false; error: string };

export async function getAdminRoster(): Promise<AdminRosterResult> {
  try {
    const viewer = await requireAdmin();
    const admins = await listAdmins();
    return { success: true, admins, viewerRole: viewer.role };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function addAdmin(email: string, role: AdminRole): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner"]);
    const client = createAdminDbClient();

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      return { success: false, error: "Enter an email address." };
    }

    const { data: profile } = await client.database
      .from("profiles")
      .select("id")
      .eq("email", trimmedEmail)
      .maybeSingle<{ id: string }>();

    if (!profile) {
      return { success: false, error: "No Sortie account found for that email — they need to sign up first." };
    }

    const { data: existing } = await client.database
      .from("admin_users")
      .select("id")
      .eq("user_id", profile.id)
      .maybeSingle<{ id: string }>();

    if (existing) {
      return { success: false, error: "This person already has admin access." };
    }

    const { error } = await client.database.from("admin_users").insert([{ user_id: profile.id, role }]);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to add this admin.") };
    }

    await logAdminAction(admin, {
      action: "add_admin",
      targetUserId: profile.id,
      targetTable: "admin_users",
      after: { email: trimmedEmail, role },
    });

    revalidatePath("/admin/team");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function removeAdmin(adminUserId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner"]);
    const client = createAdminDbClient();

    const { data: target } = await client.database
      .from("admin_users")
      .select("id,user_id,role")
      .eq("id", adminUserId)
      .maybeSingle<{ id: string; user_id: string; role: AdminRole }>();

    if (!target) {
      return { success: false, error: "Admin not found." };
    }

    if (target.role === "owner") {
      const { count } = await client.database
        .from("admin_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "owner");
      if ((count ?? 0) <= 1) {
        return { success: false, error: "Can't remove the last owner." };
      }
    }

    const { error } = await client.database.from("admin_users").delete().eq("id", adminUserId);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to remove this admin.") };
    }

    await logAdminAction(admin, {
      action: "remove_admin",
      targetUserId: target.user_id,
      targetTable: "admin_users",
      before: { role: target.role },
    });

    revalidatePath("/admin/team");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}
