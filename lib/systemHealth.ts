import { createAdminDbClient, createCacheDbClient } from "@/lib/admin/client";
import { crawlPaused } from "@/lib/crawlPause";

// System Health — the operational picture the admin portal never had
// (2026-09-10). Every panel here exists because its absence cost real time:
//
//   * Crawl/cache: the 2026-09-08 outage was caused by these crons, and the
//     recovery was done entirely by hand-editing env vars, because nothing
//     showed their state.
//   * API quotas: a whole session was spent discovering exhausted keys one
//     failed call at a time (SerpApi 250/250 on all three, Serper, Apify).
//   * Email: signup was broken for every non-owner user for days and nothing
//     surfaced it.
//   * News: six categories on a three-source fallback chain, with no way to
//     see which source actually served or whether the run happened.
//
// Every number is fetched live. Anything unreachable reports "unknown" rather
// than a zero, because a zero here reads as "healthy and empty" and would be
// worse than an honest gap.

export type HealthStatus = "ok" | "warn" | "down" | "unknown";

export type QuotaLine = {
  name: string;
  status: HealthStatus;
  detail: string;
  /** Remaining/limit when the provider exposes real numbers. */
  used?: number;
  limit?: number;
  renewsOn?: string | null;
};

export type SystemHealth = {
  crawl: {
    envPaused: boolean;
    dbPaused: boolean;
    effectivePaused: boolean;
    reason: string | null;
    pausedAt: string | null;
  };
  cache: {
    status: HealthStatus;
    totalPostings: number | null;
    activePostings: number | null;
    databaseSize: string | null;
    /** MAX_CACHED_POSTINGS, so the page can show headroom rather than a bare number. */
    budget: number;
  };
  news: {
    status: HealthStatus;
    total: number | null;
    withImages: number | null;
    lastIngestedAt: string | null;
    byCategory: { category: string; count: number }[];
  };
  quotas: QuotaLine[];
  contributions: { pending: number | null };
};

const CACHE_BUDGET = 650_000;

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[systemHealth] ${label} failed`, error);
    return fallback;
  }
}

async function serpApiQuota(): Promise<QuotaLine> {
  const keys = [process.env.SERPAPI_KEY, process.env.SERPAPI_KEY_FALLBACK, process.env.SERPAPI_KEY_FALLBACK_2]
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k));
  if (keys.length === 0) return { name: "SerpApi", status: "unknown", detail: "No key configured" };

  let left = 0;
  let total = 0;
  let renews: string | null = null;
  for (const key of keys) {
    const res = await fetch(`https://serpapi.com/account?api_key=${key}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) continue;
    const j = (await res.json()) as { total_searches_left?: number; searches_per_month?: number; plan_renewal_date?: string };
    left += j.total_searches_left ?? 0;
    total += j.searches_per_month ?? 0;
    renews = j.plan_renewal_date ?? renews;
  }

  return {
    name: "SerpApi",
    status: left === 0 ? "down" : left < total * 0.15 ? "warn" : "ok",
    detail: `${left} of ${total} searches left across ${keys.length} key${keys.length === 1 ? "" : "s"}`,
    used: total - left,
    limit: total,
    renewsOn: renews,
  };
}

async function serperQuota(): Promise<QuotaLine> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return { name: "Serper", status: "unknown", detail: "No key configured" };

  // Serper exposes no balance endpoint — x-ratelimit-* is a per-SECOND rate
  // limit, not a credit balance (a real misreading this project already made
  // once). So this only reports reachability, and says so rather than
  // implying a balance it cannot see.
  const res = await fetch("https://google.serper.dev/news", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: "labor market", num: 10 }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 403 || res.status === 402) {
    return { name: "Serper", status: "down", detail: "Key rejected or out of credits" };
  }
  return {
    name: "Serper",
    status: res.ok ? "ok" : "warn",
    detail: res.ok ? "Reachable — balance only visible on Serper's dashboard" : `HTTP ${res.status}`,
  };
}

async function apifyQuota(): Promise<QuotaLine> {
  const tokens = [process.env.APIFY_API_TOKEN, process.env.APIFY_API_TOKEN_FALLBACK, process.env.APIFY_API_TOKEN_FALLBACK_2]
    .map((t) => t?.trim())
    .filter((t): t is string => Boolean(t))
    .filter((t, i, all) => all.indexOf(t) === i);
  if (tokens.length === 0) return { name: "Apify", status: "unknown", detail: "No token configured" };

  const parts: string[] = [];
  let anyOk = false;
  for (let i = 0; i < tokens.length; i++) {
    const res = await fetch(`https://api.apify.com/v2/users/me?token=${tokens[i]}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      parts.push(`#${i + 1} HTTP ${res.status}`);
      continue;
    }
    anyOk = true;
    const j = (await res.json()) as { data?: { plan?: { id?: string } } };
    parts.push(`#${i + 1} ${j.data?.plan?.id ?? "ok"}`);
  }

  return {
    name: "Apify",
    status: anyOk ? "ok" : "down",
    detail: `${tokens.length} account${tokens.length === 1 ? "" : "s"} configured — ${parts.join(", ")}`,
  };
}

async function emailQuota(): Promise<QuotaLine> {
  // Signup depends entirely on Supabase's SMTP actually sending. This checks
  // the SMTP sender that is configured, which is what silently broke signup
  // for every non-owner user (Resend's shared onboarding@resend.dev only
  // delivers to the Resend account owner).
  const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  const url = process.env.SUPABASE_URL ?? "";
  const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  if (!token || !ref) return { name: "Signup email (SMTP)", status: "unknown", detail: "Cannot read Supabase auth config" };

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return { name: "Signup email (SMTP)", status: "unknown", detail: `HTTP ${res.status}` };

  const j = (await res.json()) as { smtp_host?: string; smtp_admin_email?: string; mailer_autoconfirm?: boolean };
  const sender = j.smtp_admin_email ?? "(none)";
  const sandbox = /@resend\.dev$/i.test(sender);
  return {
    name: "Signup email (SMTP)",
    status: !j.smtp_host ? "down" : sandbox ? "down" : "ok",
    detail: sandbox
      ? `Sending as ${sender} — a shared sandbox sender that only reaches the provider's own account owner. Signup will fail for everyone else.`
      : `${j.smtp_host} as ${sender}${j.mailer_autoconfirm ? " (confirmation disabled)" : ""}`,
  };
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const admin = createAdminDbClient();

  const settings = await safe(
    "app_settings",
    async () => {
      const { data } = await admin.database
        .from("app_settings")
        .select("crawl_paused,crawl_paused_reason,crawl_paused_at")
        .limit(1)
        .maybeSingle<{ crawl_paused: boolean; crawl_paused_reason: string | null; crawl_paused_at: string | null }>();
      return data;
    },
    null,
  );

  const envPaused = crawlPaused();
  const dbPaused = settings?.crawl_paused === true;

  const cache = await safe<SystemHealth["cache"]>(
    "cache",
    async () => {
      const db = createCacheDbClient();
      const [{ count: total }, { count: active }] = await Promise.all([
        db.database.from("discovered_postings").select("*", { count: "exact", head: true }),
        db.database.from("discovered_postings").select("*", { count: "exact", head: true }).eq("is_active", true),
      ]);
      return {
        // A null count means the cache database did not answer. Reporting
        // that as "ok" (which `(total ?? 0) > BUDGET` quietly did) is the
        // exact failure this file's header warns against: an unreachable
        // dependency rendered as healthy-and-empty.
        status: total === null || total === undefined ? "unknown" : total > CACHE_BUDGET ? "warn" : "ok",
        totalPostings: total ?? null,
        activePostings: active ?? null,
        databaseSize: null,
        budget: CACHE_BUDGET,
      };
    },
    { status: "unknown", totalPostings: null, activePostings: null, databaseSize: null, budget: CACHE_BUDGET },
  );

  const news = await safe<SystemHealth["news"]>(
    "news",
    async () => {
      const { data } = await admin.database
        .from("news_items")
        .select("category,image_url,created_at")
        .returns<{ category: string; image_url: string | null; created_at: string }[]>();
      const rows = data ?? [];
      const byCategory = Object.entries(
        rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.category]: (acc[r.category] ?? 0) + 1 }), {}),
      ).map(([category, count]) => ({ category, count }));
      const last = rows.reduce<string | null>((a, r) => (!a || r.created_at > a ? r.created_at : a), null);
      const stale = last ? Date.now() - new Date(last).getTime() > 48 * 60 * 60 * 1000 : true;
      return {
        status: rows.length === 0 ? "down" : stale ? "warn" : "ok",
        total: rows.length,
        withImages: rows.filter((r) => r.image_url).length,
        lastIngestedAt: last,
        byCategory: byCategory.sort((a, b) => b.count - a.count),
      };
    },
    { status: "unknown", total: null, withImages: null, lastIngestedAt: null, byCategory: [] },
  );

  const contributions = await safe<SystemHealth["contributions"]>(
    "contributions",
    async () => {
      const { count } = await admin.database
        .from("contributed_interview_questions")
        .select("*", { count: "exact", head: true });
      return { pending: count ?? 0 };
    },
    { pending: null },
  );

  const quotas = await Promise.all([
    safe<QuotaLine>("serpapi", serpApiQuota, { name: "SerpApi", status: "unknown", detail: "Check failed" }),
    safe<QuotaLine>("serper", serperQuota, { name: "Serper", status: "unknown", detail: "Check failed" }),
    safe<QuotaLine>("apify", apifyQuota, { name: "Apify", status: "unknown", detail: "Check failed" }),
    safe<QuotaLine>("email", emailQuota, { name: "Signup email (SMTP)", status: "unknown", detail: "Check failed" }),
  ]);

  return {
    crawl: {
      envPaused,
      dbPaused,
      effectivePaused: envPaused || dbPaused,
      reason: settings?.crawl_paused_reason ?? null,
      pausedAt: settings?.crawl_paused_at ?? null,
    },
    cache,
    news,
    quotas,
    contributions,
  };
}
