import type { createInsforgeServer } from "@/lib/insforge-server";
import { isAdminUser, resolveProvider } from "@/lib/access";
import type { ModelProvider } from "@/lib/models";

type Insforge = Awaited<ReturnType<typeof createInsforgeServer>>;

// A subscription_plans.tier slug — deliberately just `string`, not a fixed
// union. Plans are admin-managed (add/edit/remove from /admin, see
// actions/admin.ts's plan-management actions) so the set of valid tiers
// can change without a code deploy; "recon"/"command" are just the two
// seeded defaults, not hardcoded elsewhere in this module.
export type SubscriptionTier = string;

export type PremiumFeature = "insider_connections" | "company_research" | "email_lookup";

export const PREMIUM_FEATURE_LABELS: Record<PremiumFeature, string> = {
  insider_connections: "insider connection lookups",
  company_research: "company research runs",
  // Moved here from lib/usage.ts's flat DAILY_LIMITS (2026-08-28) — its real
  // per-call cost (~$0.10) and low natural usage frequency fit a monthly
  // cap far better than a daily-reset one, same reasoning insider_connections/
  // company_research already established for this mechanism.
  email_lookup: "email lookups",
};

// The ~30 lib/usage.ts UsageAction ids this plan overrides the daily cap
// for — deliberately just Partial<Record<string, number | null>> rather than
// importing UsageAction here (lib/usage.ts already imports FROM this module
// for checkJobEvaluationLimit, so importing back would be circular). null =
// unlimited for that action on this plan; an action absent from the map
// falls back to lib/usage.ts's own DAILY_LIMITS constant.
export type DailyActionLimits = Partial<Record<string, number | null>>;

// Country/region-aware pricing (direct user request, 2026-08-28) — a flat
// per-plan override map keyed by an arbitrary region code (see
// lib/regionalPricing.ts's COUNTRY_REGION_KEY for the code→region mapping),
// same "admin overwrites the whole thing on save" convention
// dailyActionLimits already established. An absent region key means that
// region falls back to this plan's own base priceCents/stripePriceId —
// additive, never retroactively repricing anyone.
export type RegionalPrices = Partial<
  Record<string, { priceCents: number; currency: string; stripePriceId: string | null }>
>;

export type PlanConfig = {
  tier: string;
  displayName: string;
  priceCents: number;
  billingPeriod: "month" | "year" | "lifetime";
  insiderConnectionsMonthlyLimit: number;
  companyResearchMonthlyLimit: number;
  emailLookupMonthlyLimit: number;
  // null = unlimited
  jobEvaluationsDailyLimit: number | null;
  dailyActionLimits: DailyActionLimits;
  regionalPrices: RegionalPrices;
  llmUnlocked: boolean;
  featureBullets: string[];
  // The Stripe Price that sells this plan (see the add-stripe-billing
  // migration) — null for the free plan and for any plan an owner hasn't
  // wired up for checkout yet.
  stripePriceId: string | null;
  // Global scarcity cap for one-time "lifetime deal" plans (Vanguard) — null
  // for every ordinary recurring plan, which has no seat limit at all. See
  // the add-vanguard-lifetime-tier migration's claim_plan_seat() for the
  // race-safe atomic claim this count is maintained by.
  maxSeats: number | null;
  seatsClaimed: number;
};

type PlanRow = {
  tier: string;
  display_name: string;
  price_cents: number;
  billing_period: "month" | "year" | "lifetime";
  insider_connections_monthly_limit: number;
  company_research_monthly_limit: number;
  email_lookup_monthly_limit: number;
  job_evaluations_daily_limit: number | null;
  daily_action_limits: DailyActionLimits | null;
  regional_prices: RegionalPrices | null;
  llm_unlocked: boolean;
  feature_bullets: string[];
  stripe_price_id: string | null;
  max_seats: number | null;
  seats_claimed: number;
};

function mapPlanRow(row: PlanRow): PlanConfig {
  return {
    tier: row.tier,
    displayName: row.display_name,
    priceCents: row.price_cents,
    billingPeriod: row.billing_period,
    insiderConnectionsMonthlyLimit: row.insider_connections_monthly_limit,
    companyResearchMonthlyLimit: row.company_research_monthly_limit,
    emailLookupMonthlyLimit: row.email_lookup_monthly_limit,
    jobEvaluationsDailyLimit: row.job_evaluations_daily_limit,
    dailyActionLimits: row.daily_action_limits ?? {},
    regionalPrices: row.regional_prices ?? {},
    llmUnlocked: row.llm_unlocked,
    featureBullets: row.feature_bullets ?? [],
    stripePriceId: row.stripe_price_id ?? null,
    maxSeats: row.max_seats ?? null,
    seatsClaimed: row.seats_claimed ?? 0,
  };
}

// The safest possible config (zero premium access, gemini-only, a
// conservative evaluation cap) — used only if a user's assigned plan row
// is somehow missing (a plan deleted out from under an existing
// subscriber should be prevented by the tier FK's default RESTRICT
// behavior, but this is the fail-SAFE default if that's ever bypassed,
// never a fail-open one).
const SAFE_FALLBACK_PLAN: PlanConfig = {
  tier: "recon",
  displayName: "Recon",
  priceCents: 0,
  billingPeriod: "month",
  insiderConnectionsMonthlyLimit: 0,
  companyResearchMonthlyLimit: 0,
  emailLookupMonthlyLimit: 10,
  jobEvaluationsDailyLimit: 3,
  dailyActionLimits: {},
  regionalPrices: {},
  llmUnlocked: false,
  featureBullets: [],
  stripePriceId: null,
  maxSeats: null,
  seatsClaimed: 0,
};

// True, code-level unlimited — never derived from a plan row, so renaming
// or deleting the "command" plan from /admin can never affect what an
// admin/owner account gets. See lib/access.ts's isAdminUser.
const ADMIN_PLAN: PlanConfig = {
  tier: "admin",
  displayName: "Admin",
  priceCents: 0,
  billingPeriod: "month",
  insiderConnectionsMonthlyLimit: Number.POSITIVE_INFINITY,
  companyResearchMonthlyLimit: Number.POSITIVE_INFINITY,
  emailLookupMonthlyLimit: Number.POSITIVE_INFINITY,
  jobEvaluationsDailyLimit: null,
  dailyActionLimits: {},
  regionalPrices: {},
  llmUnlocked: true,
  featureBullets: [],
  stripePriceId: null,
  maxSeats: null,
  seatsClaimed: 0,
};

export async function getPlan(insforge: Insforge, tier: string): Promise<PlanConfig> {
  const { data } = await insforge.database
    .from("subscription_plans")
    .select("*")
    .eq("tier", tier)
    .maybeSingle<PlanRow>();

  return data ? mapPlanRow(data) : SAFE_FALLBACK_PLAN;
}

// Public plan list for pricing/upsell UI — ordered cheapest-first so a
// free tier always renders before paid ones regardless of insertion order.
export async function listPlans(insforge: Insforge): Promise<PlanConfig[]> {
  const { data } = await insforge.database
    .from("subscription_plans")
    .select("*")
    .order("price_cents", { ascending: true })
    .returns<PlanRow[]>();

  return (data ?? []).map(mapPlanRow);
}

type TierRow = { tier: string; status: string; current_period_start: string; current_period_end: string };

// Per-user overrides an admin sets from /admin (actions/admin.ts's
// setFeatureOverride), stored on the existing profiles.feature_flags jsonb
// column — this project's own established lever for exactly this ("per-
// user experimental-feature toggles... a lever both research passes
// independently flagged as valuable", build-plan.md §R). A `true` override
// grants that one feature to that one user regardless of their plan (comp
// access, a beta test, support goodwill) — applied directly onto the
// returned plan config so every caller (circuit breakers AND UI gating
// like "does this button even render") sees it consistently, not just the
// server-side check. There is no "force off" override; is_suspended
// already covers denial.
function applyFeatureOverrides(plan: PlanConfig, overrides: Record<string, boolean>): PlanConfig {
  if (Object.keys(overrides).length === 0) return plan;

  return {
    ...plan,
    insiderConnectionsMonthlyLimit:
      overrides.insider_connections_override === true ? Number.POSITIVE_INFINITY : plan.insiderConnectionsMonthlyLimit,
    companyResearchMonthlyLimit:
      overrides.company_research_override === true ? Number.POSITIVE_INFINITY : plan.companyResearchMonthlyLimit,
    jobEvaluationsDailyLimit: overrides.job_evaluation_override === true ? null : plan.jobEvaluationsDailyLimit,
    llmUnlocked: overrides.llm_unlocked_override === true ? true : plan.llmUnlocked,
  };
}

async function getFeatureOverrides(insforge: Insforge, userId: string): Promise<Record<string, boolean>> {
  const { data } = await insforge.database
    .from("profiles")
    .select("feature_flags")
    .eq("id", userId)
    .maybeSingle<{ feature_flags: Record<string, boolean> | null }>();

  return data?.feature_flags ?? {};
}

// A missing user_subscriptions row means the "recon" plan (the free tier)
// — see the migration's own comment for why no signup-time insert is
// required.
export async function getUserSubscription(
  insforge: Insforge,
  userId: string,
  email: string | null | undefined,
): Promise<{ tier: string; status: string; periodStart: Date; periodEnd: Date; plan: PlanConfig }> {
  if (isAdminUser(email)) {
    const now = new Date();
    return { tier: "admin", status: "active", periodStart: now, periodEnd: new Date(now.getTime() + 30 * 86_400_000), plan: ADMIN_PLAN };
  }

  const [{ data }, overrides] = await Promise.all([
    insforge.database
      .from("user_subscriptions")
      .select("tier,status,current_period_start,current_period_end")
      .eq("user_id", userId)
      .maybeSingle<TierRow>(),
    getFeatureOverrides(insforge, userId),
  ]);

  if (!data) {
    const now = new Date();
    const plan = await getPlan(insforge, "recon");
    return { tier: "recon", status: "active", periodStart: now, periodEnd: new Date(now.getTime() + 30 * 86_400_000), plan: applyFeatureOverrides(plan, overrides) };
  }

  // Paused (deliberate, no charge collection while paused — see the
  // handle-stripe-subscription-pause migration) drops to the recon plan's
  // real limits for gating purposes, even though `tier` still reports the
  // real assigned plan (e.g. "command") so the UI can show "Command
  // (paused)" rather than silently relabeling them as Recon. Resuming
  // (Stripe clears pause_collection) reverts status to 'active' via the
  // same webhook trigger and access returns automatically, no separate
  // "resume" code path needed here.
  const effectiveTierForLimits = data.status === "paused" ? "recon" : data.tier;
  const plan = await getPlan(insforge, effectiveTierForLimits);
  return {
    tier: data.tier,
    status: data.status,
    periodStart: new Date(data.current_period_start),
    periodEnd: new Date(data.current_period_end),
    plan: applyFeatureOverrides(plan, overrides),
  };
}

export async function getUserTier(
  insforge: Insforge,
  userId: string,
  email: string | null | undefined,
): Promise<string> {
  const { tier } = await getUserSubscription(insforge, userId, email);
  return tier;
}

// Real bug found live (2026-08-28): lib/access.ts's resolveProvider() takes
// an optional 3rd `llmUnlocked` param that, when omitted, silently forces
// free-tier Gemini for every non-admin user — and EVERY call site in the
// codebase (33 of them, across actions/, app/api/, lib/inngest/) was
// calling the 2-arg form, meaning every paying Command/Ace/Vanguard
// subscriber was being downgraded to Gemini everywhere despite their plan's
// real llmUnlocked: true. This one helper centralizes the fix — it fetches
// the user's real plan and calls resolveProvider() correctly — so every
// call site changes from the bare `resolveProvider(model, email)` to
// `await resolveProviderForUser(insforge, userId, email, model)` instead of
// each of the 33 sites separately duplicating a getUserSubscription() call
// (more error-prone, easy for a future call site to reintroduce the same
// 2-arg mistake). resolveProvider() itself in lib/access.ts is untouched —
// still a pure sync function, safe to call directly wherever llmUnlocked is
// already known some other way.
export async function resolveProviderForUser(
  insforge: Insforge,
  userId: string,
  email: string | null | undefined,
  preferredModel: ModelProvider | null | undefined,
): Promise<ModelProvider> {
  const { plan } = await getUserSubscription(insforge, userId, email);
  return resolveProvider(preferredModel, email, plan.llmUnlocked);
}

// Best-effort — a failed notification write must never fail the circuit
// breaker call it's attached to. Deduped per billing period (not per
// blocked click) by checking for an existing row of this exact type
// created since the period started, so a user re-trying the same blocked
// action repeatedly gets one notification, not a flood.
async function notifyUsageLimitReached(
  insforge: Insforge,
  userId: string,
  feature: PremiumFeature,
  periodStart: Date,
  resetsAt: string,
): Promise<void> {
  try {
    const type = `usage_limit_${feature}`;
    const { data: existing } = await insforge.database
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("type", type)
      .gte("created_at", periodStart.toISOString())
      .maybeSingle<{ id: string }>();

    if (existing) return;

    await insforge.database.from("notifications").insert([
      {
        user_id: userId,
        type,
        title: `Monthly limit reached for ${PREMIUM_FEATURE_LABELS[feature]}`,
        body: `Resets ${new Date(resetsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`,
        link: "/settings",
      },
    ]);
  } catch (error) {
    console.error("[lib/subscription] notifyUsageLimitReached", error);
  }
}

type CircuitBreakerResult =
  | { allowed: true }
  | { allowed: false; reason: "upgrade_required"; error: string }
  // canUpgrade added 2026-08-28 — now that a plan ABOVE the mid tier
  // (Ace) exists, a paid user hitting their monthly cap on a plan-scaled
  // feature is no longer necessarily already on the best available tier
  // for it (e.g. Command's 7 insider-connections/mo vs Ace's 15), so the
  // modal needs a real per-case answer instead of assuming "monthly cap
  // reached" always means "nothing higher to offer."
  | { allowed: false; reason: "monthly_cap_reached"; error: string; resetsAt: string; canUpgrade: boolean };

function planLimitFor(plan: PlanConfig, feature: PremiumFeature): number {
  if (feature === "insider_connections") return plan.insiderConnectionsMonthlyLimit;
  if (feature === "email_lookup") return plan.emailLookupMonthlyLimit;
  return plan.companyResearchMonthlyLimit;
}

// True if any OTHER plan grants a strictly higher limit for this premium
// feature than the one the user just hit. Mirrors lib/usage.ts's own
// higherTierExistsFor for the daily-action-limit system — same reasoning,
// different data shape (a flat per-plan number here, not a per-action map).
async function premiumFeatureHasHigherTier(insforge: Insforge, currentTier: string, feature: PremiumFeature, currentLimit: number): Promise<boolean> {
  const plans = await listPlans(insforge);
  return plans.some((p) => p.tier !== currentTier && planLimitFor(p, feature) > currentLimit);
}

// The circuit breaker for Apify/Browserbase — call this BEFORE the
// external API, never after. A plan with a zero limit for this feature
// gets a clean "upgrade" refusal (no counter even touched); a plan with a
// positive limit gets a real monthly-rolling counter tied to the user's
// own subscription period (not a shared calendar month), read-then-write
// same as lib/usage.ts's checkAndConsumeUsage — an accepted small race
// window at this app's scale, not a new pattern.
export async function checkUsageLimit(
  insforge: Insforge,
  userId: string,
  email: string | null | undefined,
  feature: PremiumFeature,
): Promise<CircuitBreakerResult> {
  // True bypass — no counter read/write at all, same as
  // lib/usage.ts's checkAndConsumeUsage. Admin/owner accounts are unmetered
  // on every axis, not just given a high cap — a founder/support account
  // debugging a real user issue must never trip a "limit reached" wall.
  if (isAdminUser(email)) {
    return { allowed: true };
  }

  const { plan, periodStart, periodEnd } = await getUserSubscription(insforge, userId, email);
  const limit = planLimitFor(plan, feature);

  if (limit <= 0) {
    return {
      allowed: false,
      reason: "upgrade_required",
      error: `${PREMIUM_FEATURE_LABELS[feature]} aren't included in your ${plan.displayName} plan — upgrade to unlock this.`,
    };
  }

  const periodStartKey = periodStart.toISOString().slice(0, 10);

  const { data: existing } = await insforge.database
    .from("api_usage_metrics")
    .select("id,count")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("period_start", periodStartKey)
    .maybeSingle<{ id: string; count: number }>();

  const currentCount = existing?.count ?? 0;
  if (currentCount >= limit) {
    await notifyUsageLimitReached(insforge, userId, feature, periodStart, periodEnd.toISOString());
    const canUpgrade = await premiumFeatureHasHigherTier(insforge, plan.tier, feature, limit);
    return {
      allowed: false,
      reason: "monthly_cap_reached",
      error: `Monthly limit reached for ${PREMIUM_FEATURE_LABELS[feature]} (${limit}/month on ${plan.displayName}) — resets ${periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric" })}.`,
      resetsAt: periodEnd.toISOString(),
      canUpgrade,
    };
  }

  if (existing) {
    await insforge.database
      .from("api_usage_metrics")
      .update({ count: currentCount + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await insforge.database.from("api_usage_metrics").insert([
      {
        user_id: userId,
        feature,
        period_start: periodStartKey,
        period_end: periodEnd.toISOString().slice(0, 10),
        count: 1,
      },
    ]);
  }

  return { allowed: true };
}

// Read-only status for UI (Settings' usage panel, upsell copy) — never
// consumes a unit.
export async function getPremiumFeatureStatus(
  insforge: Insforge,
  userId: string,
  email: string | null | undefined,
  feature: PremiumFeature,
): Promise<{ tier: string; limit: number; used: number; resetsAt: string }> {
  const { tier, plan, periodStart, periodEnd } = await getUserSubscription(insforge, userId, email);
  const limit = planLimitFor(plan, feature);

  if (limit <= 0) {
    return { tier, limit, used: 0, resetsAt: periodEnd.toISOString() };
  }

  const periodStartKey = periodStart.toISOString().slice(0, 10);
  const { data } = await insforge.database
    .from("api_usage_metrics")
    .select("count")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("period_start", periodStartKey)
    .maybeSingle<{ count: number }>();

  return { tier, limit, used: data?.count ?? 0, resetsAt: periodEnd.toISOString() };
}

type JobEvaluationResult =
  | { allowed: true }
  | { allowed: false; error: string; reason?: "daily_cap_reached"; resetsAt?: string; canUpgrade?: boolean };

// The circuit breaker for job evaluations — call this once per job about
// to be sent through the AI evaluator (lib/actions/scraper.actions.ts's
// search-result batch, lib/externalJob.ts's manual paste), before the
// jobs/evaluate Inngest event is sent for it. The daily cap is sourced
// from the user's plan (jobEvaluationsDailyLimit — null means unlimited,
// Command's seeded default), not a static constant, so an admin edit to
// the plan takes effect immediately. Implemented directly against
// usage_daily (the same table lib/usage.ts's checkAndConsumeUsage uses)
// rather than through that function, since its DAILY_LIMITS lookup is a
// static per-action constant and can't take a dynamic per-plan limit.
export async function checkJobEvaluationLimit(
  insforge: Insforge,
  userId: string,
  email: string | null | undefined,
): Promise<JobEvaluationResult> {
  if (isAdminUser(email)) {
    return { allowed: true };
  }

  const { data: settings } = await insforge.database
    .from("app_settings")
    .select("ai_enabled,ai_disabled_reason")
    .eq("id", 1)
    .maybeSingle<{ ai_enabled: boolean; ai_disabled_reason: string | null }>();

  if (settings && !settings.ai_enabled) {
    return { allowed: false, error: settings.ai_disabled_reason || "AI features are temporarily disabled. Please check back shortly." };
  }

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("is_suspended,custom_usage_multiplier")
    .eq("id", userId)
    .maybeSingle<{ is_suspended: boolean; custom_usage_multiplier: number }>();

  if (profile?.is_suspended) {
    return { allowed: false, error: "This account has been suspended. Contact support if you believe this is a mistake." };
  }

  const { plan } = await getUserSubscription(insforge, userId, email);
  if (plan.jobEvaluationsDailyLimit === null) {
    return { allowed: true };
  }

  const multiplier = profile?.custom_usage_multiplier ?? 1;
  const limit = Math.max(1, Math.floor(plan.jobEvaluationsDailyLimit * multiplier));
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await insforge.database
    .from("usage_daily")
    .select("id,count")
    .eq("user_id", userId)
    .eq("day", today)
    .eq("action", "job_evaluation")
    .maybeSingle<{ id: string; count: number }>();

  const currentCount = existing?.count ?? 0;
  if (currentCount >= limit) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    // Every non-Recon plan today has jobEvaluationsDailyLimit === null
    // (unlimited) — so hitting a real numeric cap here means a strictly
    // better tier exists almost by definition. Checked properly anyway
    // (not hardcoded true) so this stays correct if that ever changes.
    const plans = await listPlans(insforge);
    const canUpgrade = plans.some(
      (p) => p.tier !== plan.tier && (p.jobEvaluationsDailyLimit === null || p.jobEvaluationsDailyLimit > limit),
    );
    return {
      allowed: false,
      error: `Daily limit reached for job evaluations (${limit}/day on ${plan.displayName}) — resets tomorrow.`,
      reason: "daily_cap_reached",
      resetsAt: tomorrow.toISOString(),
      canUpgrade,
    };
  }

  if (existing) {
    await insforge.database.from("usage_daily").update({ count: currentCount + 1 }).eq("id", existing.id);
  } else {
    await insforge.database.from("usage_daily").insert([{ user_id: userId, day: today, action: "job_evaluation", count: 1 }]);
  }

  return { allowed: true };
}
