"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
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
  limit: number;
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
        limit: Math.max(1, Math.floor(DAILY_LIMITS[action as UsageAction] * multiplier)),
      }))
      .sort((a, b) => b.count - a.count);

    return { success: true, rows, multiplier };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to load usage.") };
  }
}
