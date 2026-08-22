import { createAdminDbClient } from "@/lib/admin/client";
import type { AdminRole } from "@/lib/admin/auth";

export type AdminRosterRow = {
  id: string;
  email: string | null;
  role: AdminRole;
  createdAt: string;
};

// Same two-hop lookup pattern as getAdminNotes() below — admin_users has
// no direct FK-embed to profiles' email via InsForge's PostgREST layer.
export async function listAdmins(): Promise<AdminRosterRow[]> {
  const admin = createAdminDbClient();

  const { data: adminUsers } = await admin.database
    .from("admin_users")
    .select("id,user_id,role,created_at")
    .order("created_at", { ascending: true });
  const rows = (adminUsers ?? []) as { id: string; user_id: string; role: AdminRole; created_at: string }[];
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: profiles } = await admin.database.from("profiles").select("id,email").in("id", userIds);
  const emailByUserId = new Map(((profiles ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));

  return rows.map((r) => ({
    id: r.id,
    email: emailByUserId.get(r.user_id) ?? null,
    role: r.role,
    createdAt: r.created_at,
  }));
}

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

export type AppSettings = { aiEnabled: boolean; aiDisabledReason: string | null };

export async function getAppSettings(): Promise<AppSettings> {
  const admin = createAdminDbClient();
  const { data } = await admin.database
    .from("app_settings")
    .select("ai_enabled,ai_disabled_reason")
    .eq("id", 1)
    .maybeSingle<{ ai_enabled: boolean; ai_disabled_reason: string | null }>();

  return { aiEnabled: data?.ai_enabled ?? true, aiDisabledReason: data?.ai_disabled_reason ?? null };
}

export type UserListRow = {
  userId: string;
  email: string | null;
  fullName: string | null;
  createdAt: string | null;
  isSuspended: boolean;
  customUsageMultiplier: number;
};

export type UserListPage = { rows: UserListRow[]; totalCount: number };

const PAGE_SIZE = 25;

// Full searchable/paginated user table — v1.1's "no full user table yet"
// gap. Server-side pagination via .range(), not a fetch-everything-then-
// slice-in-JS shortcut (agy's real flagged gotcha: fine at today's scale,
// a real crash risk at a few thousand users).
export async function listUsers(page: number, search: string): Promise<UserListPage> {
  const admin = createAdminDbClient();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = admin.database
    .from("profiles")
    .select("id,email,full_name,created_at,is_suspended,custom_usage_multiplier", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`email.ilike.${term},full_name.ilike.${term}`);
  }

  const { data, count } = await query;

  const rows = (
    (data ?? []) as {
      id: string;
      email: string | null;
      full_name: string | null;
      created_at: string | null;
      is_suspended: boolean;
      custom_usage_multiplier: number;
    }[]
  ).map((p) => ({
    userId: p.id,
    email: p.email,
    fullName: p.full_name,
    createdAt: p.created_at,
    isSuspended: p.is_suspended,
    customUsageMultiplier: p.custom_usage_multiplier,
  }));

  return { rows, totalCount: count ?? 0 };
}

export type UserDetail = {
  userId: string;
  email: string | null;
  fullName: string | null;
  currentTitle: string | null;
  location: string | null;
  createdAt: string | null;
  isSuspended: boolean;
  customUsageMultiplier: number;
  featureFlags: Record<string, boolean>;
  jobCount: number;
  usageLast14Days: DailyCount[];
  subscriptionTier: string;
  subscriptionStatus: "active" | "canceled" | "past_due";
  subscriptionPeriodEnd: string | null;
};

export type AdminNoteRow = { id: string; note: string; createdAt: string; adminEmail: string | null };

export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  const admin = createAdminDbClient();

  const { data: profile } = await admin.database
    .from("profiles")
    .select("id,email,full_name,current_title,location,created_at,is_suspended,custom_usage_multiplier,feature_flags")
    .eq("id", userId)
    .maybeSingle<{
      id: string;
      email: string | null;
      full_name: string | null;
      current_title: string | null;
      location: string | null;
      created_at: string | null;
      is_suspended: boolean;
      custom_usage_multiplier: number;
      feature_flags: Record<string, boolean>;
    }>();

  if (!profile) return null;

  const since = daysAgoIso(13);
  const [{ count: jobCount }, { data: usageRows }, { data: subscription }] = await Promise.all([
    admin.database.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.database.from("usage_daily").select("day,count").eq("user_id", userId).gte("day", since),
    admin.database
      .from("user_subscriptions")
      .select("tier,status,current_period_end")
      .eq("user_id", userId)
      .maybeSingle<{ tier: string; status: "active" | "canceled" | "past_due"; current_period_end: string }>(),
  ]);

  const counts = new Map<string, number>();
  for (const row of (usageRows ?? []) as { day: string; count: number }[]) {
    counts.set(row.day, (counts.get(row.day) ?? 0) + row.count);
  }

  return {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    currentTitle: profile.current_title,
    location: profile.location,
    createdAt: profile.created_at,
    isSuspended: profile.is_suspended,
    customUsageMultiplier: profile.custom_usage_multiplier,
    featureFlags: profile.feature_flags ?? {},
    jobCount: jobCount ?? 0,
    usageLast14Days: buildDailySeries(14, counts),
    // A missing row means Recon — see the migration's own comment on why
    // no signup-time insert is required (mirrors lib/subscription.ts's
    // getUserSubscription default).
    subscriptionTier: subscription?.tier ?? "recon",
    subscriptionStatus: subscription?.status ?? "active",
    subscriptionPeriodEnd: subscription?.current_period_end ?? null,
  };
}

// admin_notes has no direct FK to admin_users' email — a second lookup
// join, not a foreign-table select, since InsForge's PostgREST layer
// doesn't expose implicit FK-embed joins the way this app's other reads
// assume for its own app-owned tables.
export async function getAdminNotes(userId: string): Promise<AdminNoteRow[]> {
  const admin = createAdminDbClient();

  const { data: notes } = await admin.database
    .from("admin_notes")
    .select("id,note,created_at,admin_user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const noteRows = (notes ?? []) as { id: string; note: string; created_at: string; admin_user_id: string }[];
  if (noteRows.length === 0) return [];

  const adminUserIds = Array.from(new Set(noteRows.map((n) => n.admin_user_id)));
  const { data: adminUsers } = await admin.database.from("admin_users").select("id,user_id").in("id", adminUserIds);
  const adminUserRows = (adminUsers ?? []) as { id: string; user_id: string }[];

  const authUserIds = adminUserRows.map((a) => a.user_id);
  const { data: profiles } =
    authUserIds.length > 0
      ? await admin.database.from("profiles").select("id,email").in("id", authUserIds)
      : { data: [] as { id: string; email: string | null }[] };

  const emailByAuthUserId = new Map(((profiles ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));
  const emailByAdminUserId = new Map(adminUserRows.map((a) => [a.id, emailByAuthUserId.get(a.user_id) ?? null]));

  return noteRows.map((n) => ({
    id: n.id,
    note: n.note,
    createdAt: n.created_at,
    adminEmail: emailByAdminUserId.get(n.admin_user_id) ?? null,
  }));
}
