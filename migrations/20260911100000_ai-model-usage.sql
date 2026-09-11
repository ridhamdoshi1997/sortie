-- Phase 52, section 3 (AI Models) — make model usage and fallback state
-- visible at all.
--
-- Nothing in this database recorded WHICH model served a call. usage_daily
-- is keyed by UsageAction, agent_runs has no model column, and the only
-- fallback state that existed was `modelCooldownUntil`, an in-memory Map in
-- lib/models.ts. That Map is process-lifetime and per-instance: on Vercel
-- each lambda has its own, so an admin page rendering in one instance could
-- never see a cooldown recorded in another. It is a request-local
-- optimization, not an observability source, and reading it from the admin
-- page would have produced a confident number that was wrong most of the
-- time.
--
-- This table is the durable, cross-instance version. One row per
-- (day, provider, model_id), counting:
--   calls           — every attempt that returned successfully on this model
--   fallback_calls  — of those, ones where this model was NOT the primary,
--                     i.e. the configured model had already failed
--   rate_limited    — 429/503 responses that pushed the chain to the next
--                     model (the event that markCooldown() reacts to)
--
-- Aggregated per day rather than one row per call, deliberately: this is an
-- operations signal ("is the primary model cooling down"), not a billing
-- ledger, and a row-per-call table on a 500 MB free tier is exactly the kind
-- of growth this project already had to write an eviction cron for.

CREATE TABLE IF NOT EXISTS public.ai_model_usage (
  day DATE NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  fallback_calls INTEGER NOT NULL DEFAULT 0,
  rate_limited INTEGER NOT NULL DEFAULT 0,
  last_rate_limited_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, provider, model_id)
);

-- Same lockdown as every other admin-only table (ai_model_config,
-- app_settings, business_expenses): RLS on, zero policies, service-role
-- only. Nothing user-facing reads this.
ALTER TABLE public.ai_model_usage ENABLE ROW LEVEL SECURITY;

-- Called from lib/models.ts with the service-role key over PostgREST.
-- SECURITY DEFINER so it does not depend on a policy, and an upsert so
-- concurrent lambdas cannot lose a count to a read-then-write race — the
-- same reasoning as increment_usage_daily's atomic form.
CREATE OR REPLACE FUNCTION public.record_model_usage(
  p_provider text,
  p_model_id text,
  p_was_fallback boolean DEFAULT false,
  p_rate_limited boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.ai_model_usage AS u (
    day, provider, model_id, calls, fallback_calls, rate_limited, last_rate_limited_at
  )
  VALUES (
    (now() AT TIME ZONE 'utc')::date,
    p_provider,
    p_model_id,
    CASE WHEN p_rate_limited THEN 0 ELSE 1 END,
    CASE WHEN p_rate_limited OR NOT p_was_fallback THEN 0 ELSE 1 END,
    CASE WHEN p_rate_limited THEN 1 ELSE 0 END,
    CASE WHEN p_rate_limited THEN now() ELSE NULL END
  )
  ON CONFLICT (day, provider, model_id) DO UPDATE SET
    calls = u.calls + CASE WHEN p_rate_limited THEN 0 ELSE 1 END,
    fallback_calls = u.fallback_calls + CASE WHEN p_rate_limited OR NOT p_was_fallback THEN 0 ELSE 1 END,
    rate_limited = u.rate_limited + CASE WHEN p_rate_limited THEN 1 ELSE 0 END,
    last_rate_limited_at = CASE WHEN p_rate_limited THEN now() ELSE u.last_rate_limited_at END,
    updated_at = now();
END;
$$;

-- service_role only. Unlike record_usage_daily this is NOT granted to
-- `authenticated` — it takes a provider/model as arguments rather than
-- resolving the caller from auth.uid(), so a signed-in user with execute
-- rights could write arbitrary rows into an admin observability table.
REVOKE ALL ON FUNCTION public.record_model_usage(text, text, boolean, boolean) FROM public;
