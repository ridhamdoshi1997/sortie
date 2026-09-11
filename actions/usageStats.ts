"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { isAdminUser } from "@/lib/access";
import { getUserSubscription } from "@/lib/subscription";
import { ACTION_LABELS, DAILY_LIMITS, type UsageAction } from "@/lib/usage";
import { toUserMessage } from "@/lib/errors";

// Settings -> Credits & usage (build-plan.md §H) — real per-action usage
// for today against this user's real daily limits, closing the "not
// available yet" placeholder that's been there since the panel shipped.
// Zero AI cost — a plain usage_daily read, same table checkAndConsumeUsage
// itself writes to.
export type UsageStatRow = {
  action: UsageAction;
  label: string;
  count: number;
  /** null means genuinely unlimited — an admin, or a plan override of null. */
  limit: number | null;
};

type Result = { success: true; rows: UsageStatRow[]; multiplier: number } | { success: false; error: string };

export async function getUsageStats(): Promise<Result> {
  try {
    const user = await requireUser();
    const insforge = await createInsforgeServer();

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("custom_usage_multiplier")
      .eq("id", user.id)
      .maybeSingle<{ custom_usage_multiplier: number }>();

    const multiplier = profile?.custom_usage_multiplier ?? 1;
    const today = new Date().toISOString().slice(0, 10);

    // Resolve the limit the SAME WAY checkAndConsumeUsage does, or this
    // reports a number that has nothing to do with what actually blocks.
    //
    // It previously used the flat DAILY_LIMITS constant alone, ignoring the
    // plan override, the admin exemption and null-means-unlimited. That was
    // survivable while every plan's daily_action_limits was {} — they all
    // resolved to the constant anyway. The moment Phase 53 gave the plans
    // real limits it became actively wrong in every direction: an Ace
    // subscriber with no cap was shown 10, a Recon user capped at 3 was
    // shown 10, and an admin with 13 generations recorded against no limit
    // at all was shown "0 of 10 left today" while still working fine.
    const admin = isAdminUser(user.email);
    const { plan } = await getUserSubscription(insforge, user.id, user.email);

    function resolveLimit(action: UsageAction): number | null {
      if (admin) return null; // uncapped, but still metered — see lib/usage.ts
      const override = plan.dailyActionLimits[action];
      if (override === null) return null; // explicit unlimited on this plan
      const base = override !== undefined ? override : DAILY_LIMITS[action];
      // An explicit 0 from the plan means "not included" and must survive
      // the multiplier floor — same carve-out as checkAndConsumeUsage.
      return base === 0 ? 0 : Math.max(1, Math.floor(base * multiplier));
    }

    const { data: usageRows } = await insforge.database
      .from("usage_daily")
      .select("action,count")
      .eq("user_id", user.id)
      .eq("day", today);

    const countByAction = new Map<string, number>();
    for (const row of (usageRows ?? []) as { action: string; count: number }[]) {
      countByAction.set(row.action, row.count);
    }

    const rows: UsageStatRow[] = Array.from(countByAction.entries())
      .filter(([action]) => action in DAILY_LIMITS)
      .map(([action, count]) => ({
        action: action as UsageAction,
        label: ACTION_LABELS[action as UsageAction],
        count,
        limit: resolveLimit(action as UsageAction),
      }))
      .sort((a, b) => b.count - a.count);

    return { success: true, rows, multiplier };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to load usage.") };
  }
}
