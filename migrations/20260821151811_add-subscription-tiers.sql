-- Freemium subscription model (Recon free / Command paid).
--
-- user_subscriptions is the source of truth for tier + billing period.
-- No payment gateway is wired yet (deliberately deferred — see
-- context/RESUME.md's monetization research) — a missing row means "recon",
-- the free tier, so no signup-time insert is required. Rows are only ever
-- written server-side today (a future billing webhook, or a manual/admin
-- upgrade) — never by the end user directly, so there is no client INSERT
-- policy, only SELECT.
CREATE TABLE public.user_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'recon' CHECK (tier IN ('recon', 'command')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 month'),
  -- Left nullable for whichever payment gateway gets picked later
  -- (Lemon Squeezy vs. InsForge's own native Stripe/Razorpay support is
  -- still an open decision) — not read or written anywhere yet.
  payment_customer_id TEXT,
  payment_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view their own subscription"
ON public.user_subscriptions FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

GRANT SELECT ON public.user_subscriptions TO authenticated;

-- Monthly-rolling usage counters for the two paid-only third-party APIs
-- (Apify insider-connection lookups, Browserbase/Stagehand company
-- research). Deliberately separate from the existing usage_daily table
-- (lib/usage.ts) — usage_daily is calendar-day metering for Gemini-cost
-- actions everyone gets some free allowance of; this is billing-period
-- metering for the two real-$ APIs that Recon gets zero of and Command
-- gets a hard monthly cap on. period_start/period_end are stored per row
-- (not recomputed from `now()`) so a user's cap resets on their own
-- subscription anniversary, not a shared calendar-month boundary.
CREATE TABLE public.api_usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL CHECK (feature IN ('insider_connections', 'company_research')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature, period_start)
);

CREATE INDEX api_usage_metrics_user_feature_idx ON public.api_usage_metrics (user_id, feature, period_start);

ALTER TABLE public.api_usage_metrics ENABLE ROW LEVEL SECURITY;

-- Same self-service shape as usage_daily's own policy — the checking/
-- incrementing server action runs with the requesting user's own
-- cookie-scoped client, not a service-role client, so it needs to be able
-- to read and write its own counter rows directly.
CREATE POLICY "users can view their own usage metrics"
ON public.api_usage_metrics FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY "users can insert their own usage metrics"
ON public.api_usage_metrics FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "users can update their own usage metrics"
ON public.api_usage_metrics FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.api_usage_metrics TO authenticated;
