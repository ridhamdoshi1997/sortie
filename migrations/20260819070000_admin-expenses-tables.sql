-- Admin console expansion, item 1 (context/RESUME.md): Expenses
-- (/admin/expenses). Two tables:
--   business_expenses — hand-entered recurring/one-time costs (hosting,
--     tools, contractors). No seed data — an admin enters these for real,
--     nothing fabricated here.
--   ai_cost_rates — hand-maintained per-UsageAction $ rate, joined against
--     usage_daily's existing per-action counts for an estimate, not real
--     per-call token metering (confirmed via research: providers reprice
--     every 3-6 months, not worth the instrumentation burden of capturing
--     real token counts on every call). Only actions with a genuine
--     external $ cost are seeded — see lib/usage.ts's own per-action cost
--     comments: search (SerpApi), company_research/strategic_moat/
--     interviewer_research (free Jina-Reader first, Perplexity worst-case
--     fallback), insider_connections/email_lookup (Apify). Every other
--     UsageAction is free-tier Gemini per those same comments — genuinely
--     $0, not an omission.

CREATE TABLE public.business_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  cadence TEXT NOT NULL CHECK (cadence IN ('monthly', 'yearly', 'one_time')),
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same lockdown as every other admin_* table (admin_users, admin_audit_log,
-- admin_notes) — RLS enabled, zero policies, service-role admin client only.
ALTER TABLE public.business_expenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.ai_cost_rates (
  action TEXT PRIMARY KEY,
  rate_cents_per_call NUMERIC NOT NULL DEFAULT 0 CHECK (rate_cents_per_call >= 0),
  provider TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_cost_rates ENABLE ROW LEVEL SECURITY;

-- Real current rates as of 2026-08-19 (see context/RESUME.md's Expenses
-- planning note). insider_connections uses this project's own observed
-- real-world average, not a generic estimate.
INSERT INTO public.ai_cost_rates (action, rate_cents_per_call, provider) VALUES
  ('search', 2.5, 'SerpApi'),
  ('company_research', 0.5, 'Perplexity (worst-case; free Jina-Reader tried first)'),
  ('strategic_moat', 0.5, 'Perplexity (worst-case; free Jina-Reader tried first)'),
  ('interviewer_research', 0.5, 'Perplexity (worst-case; free Jina-Reader tried first)'),
  ('insider_connections', 31.5, 'Apify (HarvestAPI)'),
  ('email_lookup', 10, 'Apify (HarvestAPI)');
