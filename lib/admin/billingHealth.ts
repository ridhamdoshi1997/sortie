import { createAdminDbClient } from "@/lib/admin/client";
import type { HealthStatus } from "@/lib/systemHealth";

// Billing revenue + Stripe projection health (Phase 52, section 6).
//
// /admin/billing was a plan EDITOR with no view of the actual business: no
// MRR, no subscriber count, no trial/churn/failed-payment view, and no way
// to tell whether the local projection still matched Stripe. The plan
// editor itself is untouched — this is a new panel above it.
//
// The load-bearing honesty rule here: STRIPE_SECRET_KEY can be a TEST key,
// and it currently is. Test-mode subscriptions are not revenue. Everything
// below carries the mode so the page can refuse to call test objects money,
// because a confident MRR figure built from test fixtures is worse than no
// figure at all.

export type TierRevenueRow = {
  tier: string;
  displayName: string;
  priceCents: number;
  activeCount: number;
  mrrCents: number;
};

export type StripeLive = {
  configured: boolean;
  /** "test" | "live" | "unknown" — read from the key prefix, not assumed. */
  mode: "test" | "live" | "unknown";
  reachable: boolean;
  activeSubscriptions: number | null;
  canceledSubscriptions: number | null;
  lastEventType: string | null;
  lastEventAt: string | null;
  error: string | null;
};

export type BillingHealth = {
  byTier: TierRevenueRow[];
  totalActive: number;
  /** Only ever non-null when the Stripe key is a LIVE key — see the module comment. */
  mrrCents: number | null;
  trialing: number;
  pastDue: number;
  canceledThisPeriod: number;
  /** Local rows that carry no Stripe subscription id — granted by hand, not bought. */
  unlinkedLocalSubs: number;
  stripe: StripeLive;
  /** Set when Stripe and the local projection disagree about active subscriptions. */
  driftWarning: string | null;
  status: HealthStatus;
};

const TIMEOUT_MS = 8000;

async function readStripe(): Promise<StripeLive> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    return {
      configured: false,
      mode: "unknown",
      reachable: false,
      activeSubscriptions: null,
      canceledSubscriptions: null,
      lastEventType: null,
      lastEventAt: null,
      error: "STRIPE_SECRET_KEY is not configured",
    };
  }

  const mode = key.startsWith("sk_live") ? "live" : key.startsWith("sk_test") ? "test" : "unknown";
  const headers = { Authorization: `Bearer ${key}` };

  try {
    const [subsRes, eventsRes] = await Promise.all([
      fetch("https://api.stripe.com/v1/subscriptions?limit=100&status=all", {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
      // Stripe retains events for 30 days, so "last event received" can be
      // read from the source of truth instead of standing up a local webhook
      // log that would only ever be as reliable as the webhook it records.
      fetch("https://api.stripe.com/v1/events?limit=1", { headers, signal: AbortSignal.timeout(TIMEOUT_MS) }),
    ]);

    if (!subsRes.ok) {
      const body = (await subsRes.json()) as { error?: { message?: string } };
      return {
        configured: true,
        mode,
        reachable: false,
        activeSubscriptions: null,
        canceledSubscriptions: null,
        lastEventType: null,
        lastEventAt: null,
        error: body.error?.message ?? `HTTP ${subsRes.status}`,
      };
    }

    const subs = (await subsRes.json()) as { data?: { status: string }[] };
    const events = eventsRes.ok ? ((await eventsRes.json()) as { data?: { type: string; created: number }[] }) : { data: [] };
    const lastEvent = events.data?.[0] ?? null;

    return {
      configured: true,
      mode,
      reachable: true,
      activeSubscriptions: (subs.data ?? []).filter((s) => s.status === "active").length,
      canceledSubscriptions: (subs.data ?? []).filter((s) => s.status === "canceled").length,
      lastEventType: lastEvent?.type ?? null,
      lastEventAt: lastEvent ? new Date(lastEvent.created * 1000).toISOString() : null,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      mode,
      reachable: false,
      activeSubscriptions: null,
      canceledSubscriptions: null,
      lastEventType: null,
      lastEventAt: null,
      error: error instanceof Error ? error.message : "Stripe request failed",
    };
  }
}

export async function getBillingHealth(): Promise<BillingHealth> {
  const admin = createAdminDbClient();

  const [{ data: subRows }, { data: planRows }, stripe] = await Promise.all([
    admin.database
      .from("user_subscriptions")
      .select("tier,status,payment_subscription_id,current_period_end,updated_at"),
    admin.database.from("subscription_plans").select("tier,display_name,price_cents"),
    readStripe(),
  ]);

  const subs = (subRows ?? []) as {
    tier: string;
    status: string;
    payment_subscription_id: string | null;
    current_period_end: string | null;
    updated_at: string | null;
  }[];
  const plans = (planRows ?? []) as { tier: string; display_name: string; price_cents: number }[];

  const activeByTier = new Map<string, number>();
  let trialing = 0;
  let pastDue = 0;
  let canceledThisPeriod = 0;
  let unlinkedLocalSubs = 0;

  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - 30);

  for (const s of subs) {
    if (s.status === "active") {
      activeByTier.set(s.tier, (activeByTier.get(s.tier) ?? 0) + 1);
      if (!s.payment_subscription_id) unlinkedLocalSubs += 1;
    }
    if (s.status === "trialing") trialing += 1;
    if (s.status === "past_due" || s.status === "unpaid") pastDue += 1;
    if (s.status === "canceled" && s.updated_at && new Date(s.updated_at) >= periodStart) canceledThisPeriod += 1;
  }

  const byTier: TierRevenueRow[] = plans
    .map((p) => {
      const activeCount = activeByTier.get(p.tier) ?? 0;
      return {
        tier: p.tier,
        displayName: p.display_name,
        priceCents: p.price_cents,
        activeCount,
        mrrCents: p.price_cents * activeCount,
      };
    })
    .sort((a, b) => b.mrrCents - a.mrrCents || b.activeCount - a.activeCount);

  const totalActive = byTier.reduce((s, r) => s + r.activeCount, 0);

  // MRR is withheld entirely outside live mode. Multiplying a plan price by
  // a count of test/hand-granted subscriptions produces a number that LOOKS
  // like revenue and is not — exactly the class of confidently-wrong figure
  // the Expenses rework existed to remove.
  const mrrCents = stripe.mode === "live" ? byTier.reduce((s, r) => s + r.mrrCents, 0) : null;

  // The real projection-health question: does Stripe agree with us about how
  // many paid subscriptions exist? Only Stripe-LINKED local rows are
  // comparable — a hand-granted comp has no Stripe counterpart by design.
  const linkedActive = subs.filter((s) => s.status === "active" && s.payment_subscription_id).length;
  let driftWarning: string | null = null;
  if (stripe.reachable && stripe.activeSubscriptions !== null && stripe.activeSubscriptions !== linkedActive) {
    driftWarning =
      `Stripe reports ${stripe.activeSubscriptions} active subscription${stripe.activeSubscriptions === 1 ? "" : "s"}, ` +
      `but only ${linkedActive} local row${linkedActive === 1 ? "" : "s"} carry a Stripe subscription id. ` +
      `The projection is behind, or those subscriptions belong to customers this database never recorded.`;
  }

  const status: HealthStatus = !stripe.configured
    ? "unknown"
    : !stripe.reachable
      ? "down"
      : driftWarning || pastDue > 0
        ? "warn"
        : "ok";

  return {
    byTier,
    totalActive,
    mrrCents,
    trialing,
    pastDue,
    canceledThisPeriod,
    unlinkedLocalSubs,
    stripe,
    driftWarning,
    status,
  };
}
