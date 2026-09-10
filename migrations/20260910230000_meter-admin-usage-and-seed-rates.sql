-- Phase 52, section 2 (Expenses) — the two independent causes behind the
-- structurally-$0 AI spend on /admin/expenses.
--
-- CAUSE 1: ai_cost_rates was empty. The ORIGINAL seed lives in
-- 20260819070000_admin-expenses-tables.sql and was never carried across in
-- the Supabase migration (schema came over, seeded rows did not) — the same
-- gap that left ai_model_config and app_settings empty (section 1). It is
-- re-seeded below against the CURRENT UsageAction union, not the old one:
-- three of the six actions the 2026-08-19 seed named (company_research,
-- insider_connections, email_lookup) no longer exist, and re-inserting them
-- would have created dead rows that can never join to anything.
--
-- CAUSE 2, and the one that actually mattered: usage_daily was empty too.
-- lib/usage.ts returned early on the ADMIN_EMAILS exemption BEFORE reaching
-- increment_usage_daily, so an admin never wrote a usage row — and every
-- active account on this project today is an admin account. Seeding rates
-- alone would have left the page reading exactly $0 and looking unfixed.
--
-- The fix separates METERING from ENFORCEMENT. An admin exemption should
-- exempt someone from the CAP, not from the COUNT: Apify, Perplexity and
-- SerpApi charge the same dollars no matter whose click triggered the call,
-- so usage that is not recorded is spend that cannot be reported. This
-- function records without capping. increment_usage_daily is left exactly
-- as it is — it still owns enforcement for everyone else, and its atomic
-- check-and-increment (the 2026-08-29 quota-bypass fix) is untouched.

CREATE OR REPLACE FUNCTION public.record_usage_daily(p_action text)
RETURNS TABLE(new_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Same RETURNS TABLE / `count` shadowing hazard called out in
  -- 20260829120000 — the out-column is new_count for exactly that reason.
  INSERT INTO public.usage_daily (user_id, day, action, count)
  VALUES (v_user_id, v_today, p_action, 1)
  ON CONFLICT (user_id, day, action)
  DO UPDATE SET count = usage_daily.count + 1
  RETURNING count INTO v_count;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.record_usage_daily(text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_usage_daily(text) TO authenticated;

-- Rates, re-seeded against the current 29-action union.
--
-- Every action gets a row, including the free ones at 0. That is the point:
-- with no row at all, getAiCostRates() defaulted the rate to 0, so "this
-- action genuinely costs nothing" and "nobody has ever set a rate for this
-- action" rendered identically as $0. An explicit provider string makes a
-- known zero distinguishable from an unknown one.
--
-- The three non-zero rates, and where each number comes from:
--   search              1.6c  Apify LinkedIn + Indeed actor pair, measured
--                             on this project's own runs (context/RESUME.md
--                             Phase 52). SerpApi also participates but sits
--                             on a free 250/mo x3 tier, so it adds no
--                             marginal dollars.
--   strategic_moat      0.5c  lib/usage.ts's own comment: a free Jina
--   interviewer_research 0.5c Reader fetch is tried first and only a thin
--                             result falls through to the ~$0.005/call
--                             Perplexity path. This is the WORST case, so
--                             the estimate errs high, never low.
--
-- Everything else runs on the free-tier Gemini key (lib/models.ts's default
-- provider), which has an RPM/RPD cap but no per-call charge.
--
-- ON CONFLICT DO NOTHING, not DO UPDATE: an owner can tune any of these
-- live from /admin/expenses, and re-running this migration must not stamp a
-- hand-tuned rate back to the seed value.
INSERT INTO public.ai_cost_rates (action, rate_cents_per_call, provider) VALUES
  ('search',                     1.6, 'Apify (LinkedIn + Indeed pair) — measured'),
  ('strategic_moat',             0.5, 'Perplexity (worst case; free Jina Reader tried first)'),
  ('interviewer_research',       0.5, 'Perplexity (worst case; free Jina Reader tried first)'),
  ('document_generation',        0,   'Gemini free tier'),
  ('resume_extract',             0,   'Gemini free tier'),
  ('resume_analysis',            0,   'Gemini free tier'),
  ('resume_quality_analysis',    0,   'Gemini free tier'),
  ('bullet_rewrite',             0,   'Gemini free tier'),
  ('rejection_intelligence',     0,   'Gemini free tier'),
  ('leverage_synthesis',         0,   'Gemini free tier'),
  ('interview_question_bank',    0,   'Gemini free tier'),
  ('trap_door_prediction',       0,   'Gemini free tier'),
  ('interrogation_plan',         0,   'Gemini free tier'),
  ('star_story_matching',        0,   'Gemini free tier'),
  ('question_detail_generation', 0,   'Gemini free tier'),
  ('practice_kit_generation',    0,   'Gemini free tier'),
  ('agent_message',              0,   'Gemini free tier'),
  ('outcome_narrative',          0,   'Gemini free tier'),
  ('brag_doc',                   0,   'Gemini free tier'),
  ('market_readiness',           0,   'Gemini free tier'),
  ('extension_score_preview',    0,   'Gemini free tier'),
  ('referral_message',           0,   'Gemini free tier'),
  ('negotiation_script',         0,   'Gemini free tier'),
  ('email_draft',                0,   'Gemini free tier'),
  ('outreach_message',           0,   'Gemini free tier'),
  ('jd_decoder',                 0,   'Gemini free tier'),
  ('ninety_day_plan',            0,   'Gemini free tier'),
  ('skill_gap_synthesis',        0,   'Gemini free tier'),
  ('pipeline_strategy_read',     0,   'Gemini free tier')
ON CONFLICT (action) DO NOTHING;
