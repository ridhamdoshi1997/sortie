"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireRole, type AdminRole } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { logAdminAction } from "@/lib/admin/audit";
import { deleteAllUserData } from "@/lib/accountDeletion";
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
import { sendPayout } from "@/lib/paypalPayouts";
import { classifyApplyHost } from "@/lib/applyLinkTrust";
import { looksLikeSpecificJobPosting } from "@/lib/reresolveApplyLink";

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

// Feedback system Phase 1 (approved plan) — profiles.is_tester gates the
// richer bug/feature-request form (actions/support.ts's getFeedbackAccess)
// for real users ahead of the eventual full rollout. Owners/admins already
// qualify via their admin_users role and don't need this set.
export async function setUserTester(targetUserId: string, isTester: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const { error } = await client.database.from("profiles").update({ is_tester: isTester }).eq("id", targetUserId);
    if (error) return { success: false, error: toUserMessage(error, "Failed to update this user.") };

    await logAdminAction(admin, {
      action: isTester ? "add_tester" : "remove_tester",
      targetUserId,
      targetTable: "profiles",
      targetId: targetUserId,
      after: { is_tester: isTester },
    });

    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${targetUserId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// Bulk variant for UsersTable.tsx's multi-select "Mark as tester" action —
// per direct user request ("add the users as testers" implies more than
// one at a time). Best-effort per row rather than one big IN(...) update,
// so a single bad id doesn't fail the whole batch and the caller still
// gets an accurate count of what actually changed.
export async function bulkSetUserTester(targetUserIds: string[], isTester: boolean): Promise<{ success: true; updatedCount: number } | { success: false; error: string }> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const { error } = await client.database.from("profiles").update({ is_tester: isTester }).in("id", targetUserIds);

    if (error) return { success: false, error: toUserMessage(error, "Failed to update these users.") };

    await logAdminAction(admin, {
      action: isTester ? "bulk_add_tester" : "bulk_remove_tester",
      targetTable: "profiles",
      after: { is_tester: isTester, count: targetUserIds.length },
    });

    revalidatePath("/admin/users");
    return { success: true, updatedCount: targetUserIds.length };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// Direct user request ("suspend the account and delete the user as an
// admin and owner under manage users"). Reuses lib/accountDeletion.ts's
// deleteAllUserData() — the exact same hard-won, twice-live-verified
// sequence the user's own self-service "Delete my account" (Settings)
// already runs, not a second hand-rolled copy. Owner+admin (not
// support_readonly), matching the user's explicit "as an admin and owner"
// — same gate suspend already uses on this same page.
//
// Self-deletion blocked here on purpose: an admin deleting their own
// account through the admin panel is a confusing edge case (they'd lose
// their own session and admin access mid-action) that the regular
// Settings → Delete my account flow already covers correctly. Not a
// capability gap, a deliberate redirect to the flow that's actually right
// for that case.
export async function deleteUserAsAdmin(targetUserId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    if (targetUserId === admin.userId) {
      return { success: false, error: "Use Settings → Delete my account to delete your own account." };
    }

    const client = createAdminDbClient();
    const { data: target } = await client.database.from("profiles").select("email").eq("id", targetUserId).maybeSingle<{ email: string | null }>();

    // Logged BEFORE deleting, not after — admin_audit_log.target_user_id is
    // a real FK to auth.users(id) (ON DELETE SET NULL, confirmed live via
    // pg_constraint), so an insert referencing targetUserId AFTER that row
    // is gone would fail its own FK check. logAdminAction swallows its own
    // errors (by design, see its doc comment), so that failure wouldn't
    // surface here — it would just silently drop the one audit record that
    // matters most in this entire file. Logging first, while the row still
    // exists, is the actual fix, not a reason to relax the FK.
    await logAdminAction(admin, {
      action: "delete_user",
      targetUserId,
      targetTable: "profiles",
      targetId: targetUserId,
      before: { email: target?.email ?? null },
    });

    await deleteAllUserData(targetUserId);

    revalidatePath("/admin/users");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to delete this user.") };
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
  billingPeriod: "month" | "year" | "lifetime";
  insiderConnectionsMonthlyLimit: number;
  companyResearchMonthlyLimit: number;
  emailLookupMonthlyLimit: number;
  jobEvaluationsDailyLimit: number | null;
  // Per-action daily overrides (lib/usage.ts's UsageAction ids) — absent
  // key = falls back to lib/usage.ts's own flat DAILY_LIMITS constant,
  // explicit null = unlimited on this plan. See the
  // add-ace-tier-and-daily-action-limits migration for the full reasoning.
  dailyActionLimits: Record<string, number | null>;
  // Country/region-aware pricing (direct user request, 2026-08-28) — a
  // per-plan override map keyed by an arbitrary region code (see
  // lib/regionalPricing.ts's COUNTRY_REGION_KEY). Absent key = that region
  // falls back to this plan's own base priceCents/stripePriceId above.
  regionalPrices: Record<string, { priceCents: number; currency: string; stripePriceId: string | null }>;
  llmUnlocked: boolean;
  featureBullets: string[];
  stripePriceId: string | null;
  // Global scarcity cap for a one-time "lifetime deal" plan — null means
  // unlimited (every ordinary recurring plan). Deliberately not settable
  // here: seats_claimed is the atomic counter claim_plan_seat() increments
  // from real Stripe payments (see the add-vanguard-lifetime-tier
  // migration) — an admin edit through this form must never touch it,
  // that would risk desyncing the count from the real claim ledger.
  maxSeats: number | null;
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
        email_lookup_monthly_limit: Math.max(0, Math.round(input.emailLookupMonthlyLimit)),
        job_evaluations_daily_limit:
          input.jobEvaluationsDailyLimit === null ? null : Math.max(0, Math.round(input.jobEvaluationsDailyLimit)),
        daily_action_limits: input.dailyActionLimits,
        regional_prices: input.regionalPrices,
        llm_unlocked: input.llmUnlocked,
        feature_bullets: input.featureBullets.filter((b) => b.trim().length > 0),
        stripe_price_id: input.stripePriceId?.trim() || null,
        max_seats: input.maxSeats === null ? null : Math.max(0, Math.round(input.maxSeats)),
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
        email_lookup_monthly_limit: Math.max(0, Math.round(input.emailLookupMonthlyLimit)),
        job_evaluations_daily_limit:
          input.jobEvaluationsDailyLimit === null ? null : Math.max(0, Math.round(input.jobEvaluationsDailyLimit)),
        daily_action_limits: input.dailyActionLimits,
        regional_prices: input.regionalPrices,
        llm_unlocked: input.llmUnlocked,
        feature_bullets: input.featureBullets.filter((b) => b.trim().length > 0),
        stripe_price_id: input.stripePriceId?.trim() || null,
        max_seats: input.maxSeats === null ? null : Math.max(0, Math.round(input.maxSeats)),
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

// Admin-editable AI model config (direct user request, 2026-08-29: "can we
// give the owner a permission from admin side to change the models or
// update them anytime?") — lib/models.ts's getModel() reads ai_model_config
// live on every call, falling back to a hardcoded MODEL_IDS object only if
// the table read fails, so a save here takes effect on the very next AI
// call, no redeploy. Same requireRole(["owner"]) bar as updatePlan() — this
// affects live cost/quality for every user, not a lower-stakes admin
// setting.
export type ModelConfigRow = { provider: string; tier: string; modelId: string };

export async function getModelConfigForAdmin(): Promise<ModelConfigRow[]> {
  const admin = await requireAdmin();
  requireRole(admin, ["owner", "admin"]);
  const client = createAdminDbClient();

  const { data } = await client.database
    .from("ai_model_config")
    .select("provider,tier,model_id")
    .order("provider")
    .order("tier")
    .returns<{ provider: string; tier: string; model_id: string }[]>();

  return (data ?? []).map((row) => ({ provider: row.provider, tier: row.tier, modelId: row.model_id }));
}

export async function updateModelConfig(rows: ModelConfigRow[]): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner"]);
    const client = createAdminDbClient();

    const { data: before } = await client.database.from("ai_model_config").select("provider,tier,model_id");

    for (const row of rows) {
      const modelId = row.modelId.trim();
      if (!modelId) {
        return { success: false, error: `${row.provider}/${row.tier} needs a model id — it can't be blank.` };
      }
      const { error } = await client.database
        .from("ai_model_config")
        .update({ model_id: modelId, updated_at: new Date().toISOString(), updated_by: admin.email })
        .eq("provider", row.provider)
        .eq("tier", row.tier);
      if (error) {
        return { success: false, error: toUserMessage(error, `Failed to save ${row.provider}/${row.tier}.`) };
      }
    }

    // No targetId — admin_audit_log.target_id is a uuid column and this
    // action touches multiple (provider, tier) rows at once, none of which
    // has a uuid primary key of its own (ai_model_config's PK is the
    // (provider, tier) pair). Confirmed live: passing a non-uuid sentinel
    // like "all" here fails with 22P02 and silently drops the audit entry
    // (logAdminAction is fire-and-forget by design), so this must stay
    // omitted rather than filled with a fake value.
    await logAdminAction(admin, {
      action: "update_model_config",
      targetTable: "ai_model_config",
      before: { rows: before ?? [] },
      after: { rows },
    });

    revalidatePath("/admin/ai-models");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// Affiliate program admin actions (direct user request, 2026-08-30) — a
// full-cash, manual-trigger-payout program via PayPal Payouts (lib/
// paypalPayouts.ts), distinct from the existing peer-referral system.
export type AffiliateRow = {
  id: string;
  userId: string;
  email: string | null;
  affiliateCode: string;
  paypalEmail: string;
  commissionRate: number;
  status: string;
  unpaidCents: number;
  paidCents: number;
  createdAt: string;
};

export async function getAffiliatesForAdmin(): Promise<AffiliateRow[]> {
  const admin = await requireAdmin();
  requireRole(admin, ["owner", "admin"]);
  const client = createAdminDbClient();

  const { data: affiliates } = await client.database
    .from("affiliates")
    .select("id,user_id,affiliate_code,paypal_email,commission_rate,status,created_at")
    .order("created_at", { ascending: false })
    .returns<
      { id: string; user_id: string; affiliate_code: string; paypal_email: string; commission_rate: number; status: string; created_at: string }[]
    >();

  if (!affiliates || affiliates.length === 0) return [];

  const [{ data: profiles }, { data: conversions }] = await Promise.all([
    client.database
      .from("profiles")
      .select("id,email")
      .in("id", affiliates.map((a) => a.user_id))
      .returns<{ id: string; email: string | null }[]>(),
    client.database
      .from("affiliate_conversions")
      .select("affiliate_id,commission_cents,paid_at")
      .in("affiliate_id", affiliates.map((a) => a.id))
      .returns<{ affiliate_id: string; commission_cents: number; paid_at: string | null }[]>(),
  ]);

  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  return affiliates.map((a) => {
    const rows = (conversions ?? []).filter((c) => c.affiliate_id === a.id);
    return {
      id: a.id,
      userId: a.user_id,
      email: emailById.get(a.user_id) ?? null,
      affiliateCode: a.affiliate_code,
      paypalEmail: a.paypal_email,
      commissionRate: a.commission_rate,
      status: a.status,
      unpaidCents: rows.filter((r) => !r.paid_at).reduce((sum, r) => sum + r.commission_cents, 0),
      paidCents: rows.filter((r) => r.paid_at).reduce((sum, r) => sum + r.commission_cents, 0),
      createdAt: a.created_at,
    };
  });
}

export async function updateAffiliateApplication(
  affiliateId: string,
  status: "approved" | "rejected",
  commissionRate?: number,
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner"]);
    const client = createAdminDbClient();

    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (commissionRate !== undefined) update.commission_rate = Math.max(0, Math.min(1, commissionRate));

    const { error } = await client.database.from("affiliates").update(update).eq("id", affiliateId);
    if (error) return { success: false, error: toUserMessage(error, "Failed to update this affiliate.") };

    await logAdminAction(admin, {
      action: "update_affiliate_application",
      targetTable: "affiliates",
      targetId: affiliateId,
      after: update,
    });

    revalidatePath("/admin/affiliates");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// Real money movement — gated entirely behind this explicit admin click,
// never automatic (direct user decision: "I will pay manually... but we
// need payment gateway to payout them"). Sums every unpaid conversion for
// this affiliate into ONE PayPal payout, then marks exactly those rows
// paid_at — never a blind "mark everything paid", so a payout that fails
// partway (network error before the DB update) leaves the real unpaid
// state intact to retry, rather than silently losing track of what was
// actually sent.
export async function payAffiliateNow(affiliateId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner"]);
    const client = createAdminDbClient();

    const { data: affiliate } = await client.database
      .from("affiliates")
      .select("paypal_email,status")
      .eq("id", affiliateId)
      .maybeSingle<{ paypal_email: string; status: string }>();

    if (!affiliate) return { success: false, error: "Affiliate not found." };
    if (affiliate.status !== "approved") return { success: false, error: "Only approved affiliates can be paid." };

    const { data: unpaid } = await client.database
      .from("affiliate_conversions")
      .select("id,commission_cents")
      .eq("affiliate_id", affiliateId)
      .is("paid_at", null)
      .returns<{ id: string; commission_cents: number }[]>();

    const rows = unpaid ?? [];
    if (rows.length === 0) return { success: false, error: "Nothing unpaid for this affiliate." };

    const totalCents = rows.reduce((sum, r) => sum + r.commission_cents, 0);

    const payout = await sendPayout({
      recipientEmail: affiliate.paypal_email,
      amountCents: totalCents,
      currency: "USD",
      note: `Sortie affiliate commission (${rows.length} conversion${rows.length === 1 ? "" : "s"})`,
      senderItemId: `affiliate-${affiliateId}-${Date.now()}`,
    });

    if (!payout.success) {
      return { success: false, error: payout.error };
    }

    const paidAt = new Date().toISOString();
    const { error: markError } = await client.database
      .from("affiliate_conversions")
      .update({ paid_at: paidAt })
      .in("id", rows.map((r) => r.id));

    if (markError) {
      // The real money already sent — this is now a bookkeeping-only
      // failure, surfaced clearly rather than silently retried (a retry
      // here risks a second real payout for the same conversions).
      return {
        success: false,
        error: `Payout sent (PayPal batch ${payout.batchId}) but failed to mark conversions paid — reconcile manually: ${toUserMessage(markError)}`,
      };
    }

    await logAdminAction(admin, {
      action: "pay_affiliate",
      targetTable: "affiliate_conversions",
      before: { unpaidCents: totalCents, count: rows.length },
      after: { paypalBatchId: payout.batchId, paypalBatchStatus: payout.batchStatus, paidAt },
    });

    revalidatePath("/admin/affiliates");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// Apply-link health, for /admin/link-health. Read-only, no repair — the
// hourly repairApplyLinksAsync cron does the fixing; this exists so link
// quality is VISIBLE without anyone running a script by hand, which is
// how the original 29%-on-mirror-sites problem went unnoticed until a
// user reported a single bad link (direct user request while planning for
// launch: catching this class of problem before real users hit it).
export type LinkHealthBucket = "direct" | "board" | "generic" | "mirror" | "unknown";

export type LinkHealthReport = {
  total: number;
  counts: Record<LinkHealthBucket, number>;
  worst: { id: string; company: string | null; title: string | null; url: string; bucket: LinkHealthBucket }[];
};

export async function getLinkHealth(): Promise<LinkHealthReport> {
  const admin = await requireAdmin();
  requireRole(admin, ["owner", "admin"]);

  const db = createAdminDbClient();
  // Paginated: PostgREST caps a plain select at 1000 rows, which silently
  // produced a partial (and therefore wrong) picture in an earlier
  // hand-run version of this same count.
  const rows: { id: string; company: string | null; title: string | null; external_apply_url: string | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.database
      .from("jobs")
      .select("id, company, title, external_apply_url")
      .not("external_apply_url", "is", null)
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE) break;
  }

  const counts: Record<LinkHealthBucket, number> = { direct: 0, board: 0, generic: 0, mirror: 0, unknown: 0 };
  const worst: LinkHealthReport["worst"] = [];

  for (const row of rows) {
    if (!row.external_apply_url) continue;
    const trust = classifyApplyHost(row.external_apply_url, row.company);
    const specific = looksLikeSpecificJobPosting(row.external_apply_url);
    let bucket: LinkHealthBucket;
    if (trust === "ats" || (trust === "employer" && specific)) bucket = "direct";
    else if (trust === "aggregator") bucket = "board";
    else if (trust === "employer") bucket = "generic";
    else if (trust === "low_quality") bucket = "mirror";
    else bucket = "unknown";

    counts[bucket]++;
    if ((bucket === "mirror" || bucket === "unknown" || bucket === "generic") && worst.length < 50) {
      worst.push({ id: row.id, company: row.company, title: row.title, url: row.external_apply_url, bucket });
    }
  }

  return { total: rows.length, counts, worst };
}
