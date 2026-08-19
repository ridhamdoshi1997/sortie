import { createAdminDbClient } from "@/lib/admin/client";

export type UsageLeaderboardRow = {
  userId: string;
  email: string | null;
  isSuspended: boolean;
  totalRuns: number;
  isSuspicious: boolean;
};

export type DailyCount = { date: string; count: number };

// A rough heuristic, not a tuned model — DAILY_LIMITS (lib/usage.ts) caps
// any single action type around 20-40/day, so a combined total well past
// that across every action type in one day is a real anomaly worth a
// visual flag, not a hard block. Adjust if it proves too noisy/quiet once
// there's real usage data to look at.
const SUSPICIOUS_DAILY_TOTAL = 100;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// "24h" in the loose sense build-plan.md §R's leaderboard describes —
// usage_daily (lib/usage.ts) is day-granularity, not a timestamped event
// log, so "today" is the real available window, not a true rolling 24h.
// Good enough for the actual operational question this answers: who's
// burning the shared OpenRouter rate limit right now.
export async function getTopUsersByUsage(limit = 20): Promise<UsageLeaderboardRow[]> {
  const admin = createAdminDbClient();
  const today = todayIso();

  const { data: usageRows } = await admin.database.from("usage_daily").select("user_id,count").eq("day", today);

  const totals = new Map<string, number>();
  for (const row of (usageRows ?? []) as { user_id: string; count: number }[]) {
    totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.count);
  }

  const topUserIds = Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([userId]) => userId);

  if (topUserIds.length === 0) return [];

  const { data: profileRows } = await admin.database.from("profiles").select("id,email,is_suspended").in("id", topUserIds);

  const profileById = new Map(
    ((profileRows ?? []) as { id: string; email: string | null; is_suspended: boolean }[]).map((p) => [p.id, p]),
  );

  return topUserIds.map((userId) => {
    const totalRuns = totals.get(userId) ?? 0;
    return {
      userId,
      email: profileById.get(userId)?.email ?? null,
      isSuspended: profileById.get(userId)?.is_suspended ?? false,
      totalRuns,
      isSuspicious: totalRuns >= SUSPICIOUS_DAILY_TOTAL,
    };
  });
}

// Client-side aggregation over fetched rows, not SQL GROUP BY — same
// pattern this app already uses everywhere else (lib/outcomeInsights.ts),
// fine at this project's current pre-revenue scale.
export async function getSignupsOverTime(days = 14): Promise<DailyCount[]> {
  const admin = createAdminDbClient();
  const since = daysAgoIso(days - 1);

  const { data } = await admin.database.from("profiles").select("created_at").gte("created_at", since);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { created_at: string }[]) {
    const day = row.created_at.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return buildDailySeries(days, counts);
}

export async function getUsageOverTime(days = 14): Promise<DailyCount[]> {
  const admin = createAdminDbClient();
  const since = daysAgoIso(days - 1);

  const { data } = await admin.database.from("usage_daily").select("day,count").gte("day", since);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { day: string; count: number }[]) {
    counts.set(row.day, (counts.get(row.day) ?? 0) + row.count);
  }

  return buildDailySeries(days, counts);
}

export async function getTotalUserCount(): Promise<number> {
  const admin = createAdminDbClient();
  const { count } = await admin.database.from("profiles").select("id", { count: "exact", head: true });
  return count ?? 0;
}

function buildDailySeries(days: number, counts: Map<string, number>): DailyCount[] {
  const series: DailyCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = daysAgoIso(i);
    series.push({ date, count: counts.get(date) ?? 0 });
  }
  return series;
}
