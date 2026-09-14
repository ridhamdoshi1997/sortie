"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { isAdminUser } from "@/lib/access";
import {
  getPremiumFeatureStatus,
  getUserSubscription,
  PREMIUM_FEATURE_LABELS,
  type PremiumFeature,
} from "@/lib/subscription";
import {
  DAILY_LIMITS,
  JOB_EVALUATION_ACTION,
  TRACKED_ONLY_LABELS,
  USAGE_GROUP_LABELS,
  USAGE_GROUP_OF,
  labelForTrackedAction,
  type TrackedAction,
  type UsageAction,
  type UsageGroup,
} from "@/lib/usage";
import { getUsageWindow } from "@/lib/usageMeter";
import { toUserMessage } from "@/lib/errors";

// Settings -> Credits & usage (build-plan.md §H) — every AI action this app
// meters, for today, against this user's real limits. Zero AI cost: plain
// usage_daily and api_usage_metrics reads, the same tables the gates write.
//
// Phase 54 (2026-09-14) changed three things, all from one direct report:
//   * EVERY metered action is listed, including ones with no use today. The
//     panel used to show only actions with a row for today, so a user who had
//     only searched saw a single line and no way to know what else is counted.
//   * Admins see the full list too. Uncapped is not the same as uncounted.
//   * "Today" is the user's own day, from the timezone their browser reported,
//     not UTC's.
export type UsageStatRow = {
  action: TrackedAction;
  label: string;
  group: UsageGroup;
  count: number;
  /** null means genuinely unlimited — an admin, or a plan override of null. */
  limit: number | null;
  /** AI work that runs as part of another action and is counted, never capped. */
  trackedOnly: boolean;
};

export type MonthlyUsageRow = {
  feature: PremiumFeature;
  label: string;
  used: number;
  /** null means unlimited (admin); 0 means not included in the plan. */
  limit: number | null;
  resetsAt: string;
};

export type UsageStatsData = {
  rows: UsageStatRow[];
  groups: { key: UsageGroup; label: string }[];
  monthly: MonthlyUsageRow[];
  multiplier: number;
  planName: string;
  isAdmin: boolean;
  /** IANA zone the daily limits reset in. */
  timezone: string;
  resetsAt: string;
};

type Result = ({ success: true } & UsageStatsData) | { success: false; error: string };

const PREMIUM_FEATURES: PremiumFeature[] = ["insider_connections", "company_research", "email_lookup"];

export async function getUsageStats(): Promise<Result> {
  // Outside try/catch — redirect() throws NEXT_REDIRECT, which a catch would
  // swallow as a generic error (same note as actions/billing.ts).
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const admin = isAdminUser(user.email);

    const [{ data: profile }, { plan }, usageWindow, monthly] = await Promise.all([
      insforge.database
        .from("profiles")
        .select("custom_usage_multiplier")
        .eq("id", user.id)
        .maybeSingle<{ custom_usage_multiplier: number }>(),
      getUserSubscription(insforge, user.id, user.email),
      getUsageWindow(insforge, user.id),
      Promise.all(
        PREMIUM_FEATURES.map(async (feature): Promise<MonthlyUsageRow> => {
          const status = await getPremiumFeatureStatus(insforge, user.id, user.email, feature);
          return {
            feature,
            label: PREMIUM_FEATURE_LABELS[feature],
            used: status.used,
            // ADMIN_PLAN's premium limits are Infinity, which does not survive
            // serialization to the client as a number.
            limit: Number.isFinite(status.limit) ? status.limit : null,
            resetsAt: status.resetsAt,
          };
        }),
      ),
    ]);

    const multiplier = profile?.custom_usage_multiplier ?? 1;

    // Resolve each limit the SAME WAY the gate that enforces it does, or this
    // reports a number that has nothing to do with what actually blocks.
    function resolveLimit(action: TrackedAction): number | null {
      if (admin) return null; // uncapped, but still metered — see lib/usage.ts
      if (action in TRACKED_ONLY_LABELS) return null;
      if (action === JOB_EVALUATION_ACTION) {
        // lib/subscription.ts's checkJobEvaluationLimit, multiplier included.
        return plan.jobEvaluationsDailyLimit === null
          ? null
          : Math.max(1, Math.floor(plan.jobEvaluationsDailyLimit * multiplier));
      }
      const override = plan.dailyActionLimits[action as UsageAction];
      if (override === null) return null; // explicit unlimited on this plan
      const base = override !== undefined ? override : DAILY_LIMITS[action as UsageAction];
      // An explicit 0 from the plan means "not included" and must survive the
      // multiplier floor — same carve-out as checkAndConsumeUsage.
      return base === 0 ? 0 : Math.max(1, Math.floor(base * multiplier));
    }

    const { data: usageRows } = await insforge.database
      .from("usage_daily")
      .select("action,count")
      .eq("user_id", user.id)
      .eq("day", usageWindow.day);

    const countByAction = new Map<string, number>();
    for (const row of (usageRows ?? []) as { action: string; count: number }[]) {
      countByAction.set(row.action, row.count);
    }

    // Driven by USAGE_GROUP_OF, a Record over every tracked action — a new
    // metered action that is never placed in a group fails to compile rather
    // than silently going missing from this screen.
    const rows: UsageStatRow[] = (Object.keys(USAGE_GROUP_OF) as TrackedAction[]).map((action) => ({
      action,
      label: labelForTrackedAction(action),
      group: USAGE_GROUP_OF[action],
      count: countByAction.get(action) ?? 0,
      limit: resolveLimit(action),
      trackedOnly: action in TRACKED_ONLY_LABELS,
    }));

    const groups = (Object.keys(USAGE_GROUP_LABELS) as UsageGroup[]).map((key) => ({
      key,
      label: USAGE_GROUP_LABELS[key],
    }));

    return {
      success: true,
      rows,
      groups,
      monthly,
      multiplier,
      planName: plan.displayName,
      isAdmin: admin,
      timezone: usageWindow.timezone,
      resetsAt: usageWindow.resetsAt,
    };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to load usage.") };
  }
}
