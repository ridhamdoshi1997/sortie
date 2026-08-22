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
import { getExpensesSummary, type ExpensesSummary, type ExpenseCadence } from "@/lib/admin/expenses";
import type { UsageAction } from "@/lib/usage";
import { listPlans, type PlanConfig } from "@/lib/subscription";
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

// Expenses (2026-08-19, admin console expansion item 1) — hand-entered
// recurring/one-time business_expenses plus the hand-maintained
// ai_cost_rates estimate joined against usage_daily. See
// lib/admin/expenses.ts for the estimate's own reasoning.
type ExpensesPageResult = { success: true; data: ExpensesSummary } | { success: false; error: string };

export async function getExpensesPage(): Promise<ExpensesPageResult> {
  try {
    await requireAdmin();
    const data = await getExpensesSummary();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function addBusinessExpense(
  name: string,
  category: string,
  amountCents: number,
  cadence: ExpenseCadence,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const trimmedName = name.trim();
    if (!trimmedName) {
      return { success: false, error: "Enter a name for this expense." };
    }
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      return { success: false, error: "Enter a valid amount." };
    }

    const trimmedCategory = category.trim() || "Other";

    const { error } = await client.database.from("business_expenses").insert([
      {
        name: trimmedName,
        category: trimmedCategory,
        amount_cents: Math.round(amountCents),
        cadence,
        created_by: admin.id,
      },
    ]);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to add this expense.") };
    }

    await logAdminAction(admin, {
      action: "add_business_expense",
      targetTable: "business_expenses",
      after: { name: trimmedName, category: trimmedCategory, amountCents, cadence },
    });

    revalidatePath("/admin/expenses");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function removeBusinessExpense(expenseId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const { error } = await client.database.from("business_expenses").delete().eq("id", expenseId);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to remove this expense.") };
    }

    await logAdminAction(admin, {
      action: "remove_business_expense",
      targetTable: "business_expenses",
      targetId: expenseId,
    });

    revalidatePath("/admin/expenses");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// Owner-only — tuning the hand-maintained cost estimate as providers
// reprice (context/RESUME.md: "providers reprice every 3-6 months") is a
// blast-radius-large enough lever to match the AI kill switch's gating,
// not the everyday admin/support level.
export async function updateAiCostRate(action: UsageAction, rateCentsPerCall: number, provider: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner"]);
    const client = createAdminDbClient();

    if (!Number.isFinite(rateCentsPerCall) || rateCentsPerCall < 0) {
      return { success: false, error: "Enter a valid rate." };
    }

    const { error } = await client.database.from("ai_cost_rates").upsert(
      [
        {
          action,
          rate_cents_per_call: rateCentsPerCall,
          provider: provider.trim() || null,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "action" },
    );

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to update this rate.") };
    }

    await logAdminAction(admin, {
      action: "update_ai_cost_rate",
      targetTable: "ai_cost_rates",
      after: { action, rateCentsPerCall, provider },
    });

    revalidatePath("/admin/expenses");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// --- Subscription plans (build-plan.md §J) ---------------------------------
// Plans are read live everywhere (lib/subscription.ts never caches a plan
// row), so an owner edit here — price, monthly caps, marketing bullets, or
// adding/removing a whole plan — takes effect immediately for every user on
// that plan, no redeploy.

type PlansResult = { success: true; data: PlanConfig[] } | { success: false; error: string };

export async function getPlansForAdmin(): Promise<PlansResult> {
  try {
    await requireAdmin();
    const client = createAdminDbClient();
    const data = await listPlans(client);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export type PlanInput = {
  tier: string;
  displayName: string;
  priceCents: number;
  billingPeriod: "month" | "year";
  insiderConnectionsMonthlyLimit: number;
  companyResearchMonthlyLimit: number;
  jobEvaluationsDailyLimit: number | null;
  llmUnlocked: boolean;
  featureBullets: string[];
  stripePriceId: string | null;
};

function isValidTierSlug(tier: string): boolean {
  return /^[a-z][a-z0-9_]{1,31}$/.test(tier);
}

// Pricing/billing structure is owner-only — the same gating level as the
// AI kill switch and cost-rate tuning, not the everyday admin/support tier.
export async function createPlan(input: PlanInput): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner"]);
    const client = createAdminDbClient();

    if (!isValidTierSlug(input.tier)) {
      return { success: false, error: "Plan slug must be lowercase letters, numbers, and underscores, starting with a letter." };
    }
    if (!input.displayName.trim()) {
      return { success: false, error: "Display name is required." };
    }

    const { error } = await client.database.from("subscription_plans").insert([
      {
        tier: input.tier,
        display_name: input.displayName.trim(),
        price_cents: Math.max(0, Math.round(input.priceCents)),
        billing_period: input.billingPeriod,
        insider_connections_monthly_limit: Math.max(0, Math.round(input.insiderConnectionsMonthlyLimit)),
        company_research_monthly_limit: Math.max(0, Math.round(input.companyResearchMonthlyLimit)),
        job_evaluations_daily_limit:
          input.jobEvaluationsDailyLimit === null ? null : Math.max(0, Math.round(input.jobEvaluationsDailyLimit)),
        llm_unlocked: input.llmUnlocked,
        feature_bullets: input.featureBullets.filter((b) => b.trim().length > 0),
        stripe_price_id: input.stripePriceId?.trim() || null,
      },
    ]);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to create this plan — the slug may already exist.") };
    }

    await logAdminAction(admin, {
      action: "create_plan",
      targetTable: "subscription_plans",
      targetId: input.tier,
      after: input,
    });

    revalidatePath("/admin/billing");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function updatePlan(tier: string, input: Omit<PlanInput, "tier">): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner"]);
    const client = createAdminDbClient();

    const { data: before } = await client.database.from("subscription_plans").select("*").eq("tier", tier).maybeSingle();

    const { error } = await client.database
      .from("subscription_plans")
      .update({
        display_name: input.displayName.trim(),
        price_cents: Math.max(0, Math.round(input.priceCents)),
        billing_period: input.billingPeriod,
        insider_connections_monthly_limit: Math.max(0, Math.round(input.insiderConnectionsMonthlyLimit)),
        company_research_monthly_limit: Math.max(0, Math.round(input.companyResearchMonthlyLimit)),
        job_evaluations_daily_limit:
          input.jobEvaluationsDailyLimit === null ? null : Math.max(0, Math.round(input.jobEvaluationsDailyLimit)),
        llm_unlocked: input.llmUnlocked,
        feature_bullets: input.featureBullets.filter((b) => b.trim().length > 0),
        stripe_price_id: input.stripePriceId?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("tier", tier);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to update this plan.") };
    }

    await logAdminAction(admin, {
      action: "update_plan",
      targetTable: "subscription_plans",
      targetId: tier,
      before: before ?? undefined,
      after: input,
    });

    revalidatePath("/admin/billing");
    revalidatePath("/pricing");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// The tier FK on user_subscriptions (default RESTRICT, no ON DELETE
// clause — see the generalize-subscription-tiers migration) blocks this at
// the database level while any real subscriber is still on the plan; that
// constraint violation surfaces here as a clean, expected error rather
// than a silent orphaning of those users' subscription rows.
export async function deletePlan(tier: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner"]);
    const client = createAdminDbClient();

    const { error } = await client.database.from("subscription_plans").delete().eq("tier", tier);

    if (error) {
      return {
        success: false,
        error: toUserMessage(error, "Can't delete this plan — move its subscribers to a different plan first."),
      };
    }

    await logAdminAction(admin, {
      action: "delete_plan",
      targetTable: "subscription_plans",
      targetId: tier,
    });

    revalidatePath("/admin/billing");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// --- Per-user subscription + feature overrides ------------------------------

export async function setUserSubscriptionTier(targetUserId: string, tier: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const { data: planExists } = await client.database
      .from("subscription_plans")
      .select("tier")
      .eq("tier", tier)
      .maybeSingle<{ tier: string }>();

    if (!planExists) {
      return { success: false, error: "That plan doesn't exist." };
    }

    const { data: before } = await client.database
      .from("user_subscriptions")
      .select("tier")
      .eq("user_id", targetUserId)
      .maybeSingle<{ tier: string }>();

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 86_400_000);

    const { error } = await client.database.from("user_subscriptions").upsert(
      [
        {
          user_id: targetUserId,
          tier,
          status: "active",
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        },
      ],
      { onConflict: "user_id" },
    );

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to update this user's plan.") };
    }

    await logAdminAction(admin, {
      action: "set_subscription_tier",
      targetUserId,
      targetTable: "user_subscriptions",
      targetId: targetUserId,
      before: { tier: before?.tier ?? "recon" },
      after: { tier },
    });

    revalidatePath(`/admin/users/${targetUserId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export type FeatureOverrideKey =
  | "insider_connections_override"
  | "company_research_override"
  | "job_evaluation_override"
  | "llm_unlocked_override";

// Grants ONE specific premium feature to ONE specific user regardless of
// their plan (see lib/subscription.ts's applyFeatureOverrides) — stored on
// the existing profiles.feature_flags jsonb column, read-modify-write since
// PostgREST has no native "patch one jsonb key" operation.
export async function setFeatureOverride(targetUserId: string, key: FeatureOverrideKey, enabled: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const { data: before } = await client.database
      .from("profiles")
      .select("feature_flags")
      .eq("id", targetUserId)
      .maybeSingle<{ feature_flags: Record<string, boolean> | null }>();

    const nextFlags = { ...(before?.feature_flags ?? {}), [key]: enabled };

    const { error } = await client.database.from("profiles").update({ feature_flags: nextFlags }).eq("id", targetUserId);

    if (error) {
      return { success: false, error: toUserMessage(error, "Failed to update this user's feature access.") };
    }

    await logAdminAction(admin, {
      action: "set_feature_override",
      targetUserId,
      targetTable: "profiles",
      targetId: targetUserId,
      before: { [key]: before?.feature_flags?.[key] ?? false },
      after: { [key]: enabled },
    });

    revalidatePath(`/admin/users/${targetUserId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}
