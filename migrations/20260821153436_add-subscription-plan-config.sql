-- Admin-editable plan content — price, monthly caps, and marketing feature
-- bullets for each tier. Same shape as the existing app_settings table (a
-- fixed small set of rows, service-role-only writes, read by both server
-- logic and public-facing copy) rather than inventing a new config
-- pattern. Owners can edit a row from /admin and it takes effect
-- immediately everywhere that reads this table — no redeploy, no
-- hardcoded constant to fall out of sync with what marketing copy says.
CREATE TABLE public.subscription_plans (
  tier TEXT PRIMARY KEY CHECK (tier IN ('recon', 'command')),
  display_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL DEFAULT 0,
  billing_period TEXT NOT NULL DEFAULT 'month' CHECK (billing_period IN ('month', 'year')),
  -- NULL means unlimited (Command's job-evaluation cap; LLM router is
  -- governed by llm_unlocked below, not a numeric field).
  insider_connections_monthly_limit INTEGER NOT NULL DEFAULT 0,
  company_research_monthly_limit INTEGER NOT NULL DEFAULT 0,
  job_evaluations_daily_limit INTEGER,
  llm_unlocked BOOLEAN NOT NULL DEFAULT false,
  -- Short marketing bullets for pricing/upsell copy, ordered array of
  -- strings — small and rarely-queried-independently, a legitimate JSONB
  -- use per this project's own "normalize large JSONB" migration guidance
  -- (this is neither large nor filtered/sorted on).
  feature_bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.subscription_plans
  (tier, display_name, price_cents, billing_period, insider_connections_monthly_limit, company_research_monthly_limit, job_evaluations_daily_limit, llm_unlocked, feature_bullets)
VALUES
  ('recon', 'Recon', 0, 'month', 0, 0, 3, false,
   '["3 AI job evaluations/day", "Gemini-powered matching", "Missions tracker & Career OS"]'::jsonb),
  ('command', 'Command', 1500, 'month', 7, 25, NULL, true,
   '["Unlimited AI job evaluations", "GPT-4o & Claude unlocked", "7 insider connection lookups/month", "25 company research briefings/month"]'::jsonb)
ON CONFLICT (tier) DO NOTHING;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- Readable by anyone, including logged-out visitors on the public pricing
-- page — this is marketing content, not sensitive data. Only a
-- service-role client (the admin panel) can write it.
CREATE POLICY "anyone can view plan config"
ON public.subscription_plans FOR SELECT TO authenticated, anon
USING (true);

GRANT SELECT ON public.subscription_plans TO authenticated, anon;
