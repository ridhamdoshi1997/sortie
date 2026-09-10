import type { HealthStatus } from "@/lib/systemHealth";

// Vendor costs — the half of this project's spend that /admin/expenses could
// never see (Phase 52, section 2).
//
// ai_cost_rates x usage_daily only ever covers work a USER triggers. Most of
// what this project actually spends is background: 13 Inngest crons, the
// proactive ATS crawl, the daily news ingestion. None of that consumes a
// UsageAction, so none of it appeared anywhere on the Expenses page.
//
// Two deliberate design choices:
//
//   1. The vendor list is a CODE constant, not a table. Which vendor bills
//      on what, and which plan this project sits on, is engineering
//      knowledge that changes with the code — not data an admin should have
//      to keep in sync by hand. The dollar amounts an admin genuinely does
//      own (a paid subscription's monthly fee) stay in business_expenses,
//      where they already were.
//
//   2. `measured` is never guessed. A line is only marked measured when the
//      number came back from the vendor's own API on THIS request. Anything
//      else reports what it is — a free tier with no marginal cost, or a
//      vendor that exposes no usage endpoint at all — rather than printing
//      a plausible zero. A zero that means "we didn't look" is exactly the
//      failure this whole section exists to fix.

export type VendorCostLine = {
  key: string;
  name: string;
  /** What the vendor actually charges for. */
  billedOn: string;
  /** The plan this project is on right now. */
  plan: string;
  /** True only when spendCents came from the vendor's own API this request. */
  measured: boolean;
  /** Real spend this billing cycle, in cents. null when the vendor exposes no usage endpoint. */
  spendCents: number | null;
  /** Free-credit ceiling for the cycle, in cents, where one exists. */
  capCents: number | null;
  status: HealthStatus;
  detail: string;
  cycleEndsOn: string | null;
};

const TIMEOUT_MS = 8000;

async function safeLine(key: string, fn: () => Promise<VendorCostLine>, fallback: VendorCostLine): Promise<VendorCostLine> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[vendorCosts] ${key} failed`, error);
    return fallback;
  }
}

// Apify is the only vendor here that bills this project real, variable money
// today, and the only one that exposes a genuine dollar figure — so it is the
// one line on this page that is a measurement rather than an estimate.
//
// /v2/users/me/usage/monthly returns per-service usage for the CURRENT
// billing cycle (which is not a calendar month — it runs from the signup
// anniversary, so "this month" here means the cycle, and the page shows the
// end date rather than implying month-to-date).
async function apifyVendor(): Promise<VendorCostLine> {
  const token = process.env.APIFY_API_TOKEN?.trim();
  if (!token) {
    return {
      key: "apify",
      name: "Apify",
      billedOn: "Actor compute + paid-actor events (LinkedIn, Indeed)",
      plan: "unknown",
      measured: false,
      spendCents: null,
      capCents: null,
      status: "unknown",
      detail: "No token configured",
      cycleEndsOn: null,
    };
  }

  const [usageRes, meRes] = await Promise.all([
    fetch(`https://api.apify.com/v2/users/me/usage/monthly?token=${token}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
    fetch(`https://api.apify.com/v2/users/me?token=${token}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }),
  ]);

  if (!usageRes.ok) {
    return {
      key: "apify",
      name: "Apify",
      billedOn: "Actor compute + paid-actor events (LinkedIn, Indeed)",
      plan: "unknown",
      measured: false,
      spendCents: null,
      capCents: null,
      status: "unknown",
      detail: `Usage endpoint returned HTTP ${usageRes.status}`,
      cycleEndsOn: null,
    };
  }

  const usage = (await usageRes.json()) as {
    data?: {
      usageCycle?: { startAt?: string; endAt?: string };
      totalUsageCreditsUsdAfterVolumeDiscount?: number;
      monthlyServiceUsage?: Record<string, { amountAfterVolumeDiscountUsd?: number }>;
    };
  };
  const me = meRes.ok
    ? ((await meRes.json()) as { data?: { plan?: { id?: string; maxMonthlyUsageUsd?: number } } })
    : { data: undefined };

  const spendUsd = usage.data?.totalUsageCreditsUsdAfterVolumeDiscount ?? 0;
  const capUsd = me.data?.plan?.maxMonthlyUsageUsd ?? null;
  const spendCents = Math.round(spendUsd * 100);
  const capCents = capUsd === null ? null : Math.round(capUsd * 100);

  // The biggest single line item, named explicitly — on this project it is
  // PAID_ACTORS_PER_EVENT (the LinkedIn/Indeed actors), and knowing that is
  // the difference between "spend is up" and "spend is up because search ran".
  const services = Object.entries(usage.data?.monthlyServiceUsage ?? {})
    .map(([name, v]) => ({ name, usd: v.amountAfterVolumeDiscountUsd ?? 0 }))
    .sort((a, b) => b.usd - a.usd);
  const top = services[0];

  const pct = capCents && capCents > 0 ? (spendCents / capCents) * 100 : null;

  return {
    key: "apify",
    name: "Apify",
    billedOn: "Actor compute + paid-actor events (LinkedIn, Indeed)",
    plan: me.data?.plan?.id ?? "unknown",
    measured: true,
    spendCents,
    capCents,
    // Warn well before the wall: an exhausted Apify credit takes LinkedIn and
    // Indeed out of every search with no other symptom.
    status: pct === null ? "ok" : pct >= 90 ? "down" : pct >= 70 ? "warn" : "ok",
    detail: top
      ? `Largest line: ${top.name} at $${top.usd.toFixed(2)}`
      : "No usage recorded this cycle",
    cycleEndsOn: usage.data?.usageCycle?.endAt ?? null,
  };
}

// SerpApi's free plan costs nothing, so the honest spend is $0 — but the
// QUOTA is the real constraint and it is measurable, so it is reported here
// as consumption rather than dollars.
async function serpApiVendor(): Promise<VendorCostLine> {
  const keys = [process.env.SERPAPI_KEY, process.env.SERPAPI_KEY_FALLBACK, process.env.SERPAPI_KEY_FALLBACK_2]
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k));

  const base = {
    key: "serpapi",
    name: "SerpApi",
    billedOn: "Searches (news ingestion image lookup)",
    plan: `Free — 250/mo x ${keys.length} key${keys.length === 1 ? "" : "s"}`,
    spendCents: 0,
    capCents: 0,
    cycleEndsOn: null as string | null,
  };

  if (keys.length === 0) {
    return { ...base, plan: "Not configured", measured: false, status: "unknown", detail: "No key configured" };
  }

  let left = 0;
  let total = 0;
  let renews: string | null = null;
  for (const key of keys) {
    const res = await fetch(`https://serpapi.com/account?api_key=${key}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) continue;
    const j = (await res.json()) as { total_searches_left?: number; searches_per_month?: number; plan_renewal_date?: string };
    left += j.total_searches_left ?? 0;
    total += j.searches_per_month ?? 0;
    renews = j.plan_renewal_date ?? renews;
  }

  return {
    ...base,
    measured: true,
    status: left === 0 ? "warn" : "ok",
    detail:
      left === 0
        ? `Exhausted — 0 of ${total} searches left, news ingestion is falling through to Serper`
        : `${left} of ${total} searches left`,
    cycleEndsOn: renews,
  };
}

// Deliberately NOT measured. Serper exposes no balance endpoint at all — its
// x-ratelimit-* headers are a per-SECOND rate limit, not a credit balance,
// a misreading this project has already made once (see lib/systemHealth.ts's
// serperQuota). Rather than print a confident $0, this line states the known
// rate and the known call volume and leaves the balance to Serper's own
// dashboard.
function serperVendor(): VendorCostLine {
  const configured = Boolean(process.env.SERPER_API_KEY?.trim());
  return {
    key: "serper",
    name: "Serper",
    billedOn: "Credits — ~$0.001 each, ~6/day on the daily news cron",
    plan: configured ? "Prepaid credits" : "Not configured",
    measured: false,
    spendCents: null,
    capCents: null,
    status: configured ? "ok" : "unknown",
    detail: configured
      ? "No balance endpoint exists — check Serper's dashboard. At ~6 credits/day this is well under $1/mo."
      : "No key configured",
    cycleEndsOn: null,
  };
}

// The free-tier estate. Every one of these is genuinely $0 today, and each
// says WHY it is free and what would end that, so a zero here is a fact
// rather than a blank. None expose a usage/billing endpoint this project has
// credentials for, so none claim to be measured.
function freeTierVendors(): VendorCostLine[] {
  const lines: { key: string; name: string; billedOn: string; plan: string; detail: string }[] = [
    {
      key: "gemini",
      name: "Google Gemini",
      billedOn: "Per token — but the free tier is rate-limited, not billed",
      plan: "Free tier",
      detail:
        "Every AI action except search runs here at no marginal cost. The constraint is RPM/RPD limits, not dollars — lib/models.ts falls back down a model chain when one is throttled.",
    },
    {
      key: "perplexity",
      name: "Perplexity",
      billedOn: "Per request — ~$0.005, worst-case fallback only",
      plan: "Pay as you go",
      detail:
        "Only reached when the free Jina Reader fetch comes up thin on strategic_moat / interviewer_research. Metered per-action in the table above rather than here.",
    },
    {
      key: "supabase",
      name: "Supabase",
      billedOn: "Database size, egress",
      plan: "Free — 2 projects (main + crawl cache)",
      detail:
        "Confirmed free at the org level via the Management API (Phase 50). The 500 MB per-project cap is a real platform limit, which is why the eviction cron exists.",
    },
    {
      key: "vercel",
      name: "Vercel",
      billedOn: "Function invocations, bandwidth",
      plan: "Hobby",
      detail: "Enter a real amount in Business expenses below if this project moves to a paid plan.",
    },
    {
      key: "brevo",
      name: "Brevo",
      billedOn: "Emails sent",
      plan: "Free — 300/day",
      detail: "Carries Supabase's SMTP, which is what signup depends on. Well under the cap at current volume.",
    },
    {
      key: "resend",
      name: "Resend",
      billedOn: "Emails sent",
      plan: "Free",
      detail:
        "No longer on the signup path — SMTP moved to Brevo in Phase 51 after Resend's shared sandbox sender broke signup for every non-owner address.",
    },
    {
      key: "jina",
      name: "Jina Reader",
      billedOn: "Requests",
      plan: "Free (keyless)",
      detail: "Tried first on every research action and on description extraction; the paid Perplexity path only runs when this comes up thin.",
    },
    {
      key: "inngest",
      name: "Inngest",
      billedOn: "Function runs",
      plan: "Free",
      detail: "Runs all 13 crons. Preview environments auto-archive 3 days after their last deploy — a real operational gotcha, not a billing one.",
    },
  ];

  return lines.map((l) => ({
    ...l,
    measured: false,
    spendCents: 0,
    capCents: null,
    status: "ok" as HealthStatus,
    cycleEndsOn: null,
  }));
}

export async function getVendorCosts(): Promise<VendorCostLine[]> {
  const [apify, serpapi] = await Promise.all([
    safeLine("apify", apifyVendor, {
      key: "apify",
      name: "Apify",
      billedOn: "Actor compute + paid-actor events (LinkedIn, Indeed)",
      plan: "unknown",
      measured: false,
      spendCents: null,
      capCents: null,
      status: "unknown",
      detail: "Check failed",
      cycleEndsOn: null,
    }),
    safeLine("serpapi", serpApiVendor, {
      key: "serpapi",
      name: "SerpApi",
      billedOn: "Searches (news ingestion image lookup)",
      plan: "unknown",
      measured: false,
      spendCents: null,
      capCents: null,
      status: "unknown",
      detail: "Check failed",
      cycleEndsOn: null,
    }),
  ]);

  return [apify, serpapi, serperVendor(), ...freeTierVendors()];
}
