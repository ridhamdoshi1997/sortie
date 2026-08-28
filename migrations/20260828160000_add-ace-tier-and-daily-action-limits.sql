-- Subscription-tier scaling for lib/usage.ts's DAILY_LIMITS actions (direct
-- user request, 2026-08-28) -- these previously used the SAME flat daily
-- number for every user regardless of plan (only job_evaluations_daily_limit
-- and the two checkUsageLimit features already scaled per tier).
--
-- daily_action_limits is a per-plan override map, keyed by UsageAction, JSON
-- value null = unlimited for that action on that plan; an action absent from
-- the map falls back to lib/usage.ts's own DAILY_LIMITS constant (Recon/free
-- needs no entries at all -- its row stays the existing flat numbers).
--
-- email_lookup moves OUT of the daily system entirely, into the same
-- monthly checkUsageLimit/PremiumFeature mechanism insider_connections and
-- company_research already use -- its real per-call cost (~$0.10) and low
-- natural usage frequency fit a monthly cap far better than a daily-reset
-- one, and folding a "40/month" number into a daily table would either
-- round awkwardly or let a user "bank" unused days, which a real monthly
-- cap already handles correctly.
--
-- Researched via agy (competitor pricing + a cost-profile-cohorting scaling
-- model), then revised for real unit economics: Vanguard is a one-time $149
-- lifetime payment with no recurring revenue to fund unbounded usage, so it
-- stays conservative rather than getting the highest numbers by default
-- (see progress-tracker.md's Phase 28 entry for the full reasoning) --
-- these are launch numbers to revisit once real usage data exists, not
-- permanently fixed.
ALTER TABLE public.subscription_plans
  ADD COLUMN daily_action_limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN email_lookup_monthly_limit INTEGER NOT NULL DEFAULT 10;

-- Recon's real email_lookup exposure today is unbounded (4/day = up to ~120/
-- month for a determined free user) -- tightened to a real monthly cap here
-- as part of the same fix, not a separate decision.
UPDATE public.subscription_plans SET email_lookup_monthly_limit = 10 WHERE tier = 'recon';
-- Conservative placeholder matching Command's own number, pending the
-- broader Vanguard-tier revisit the user explicitly deferred.
UPDATE public.subscription_plans SET email_lookup_monthly_limit = 20 WHERE tier IN ('command', 'vanguard');

-- New top tier: real recurring revenue ($29/mo, not one-time), so it can
-- sustainably afford genuinely generous/unlimited limits the lifetime
-- Vanguard tier structurally cannot. Named "Ace" -- the Sortie/aviation
-- vocabulary's own term for a pilot who's proven elite status across many
-- sorties, consistent with Recon/Command/Vanguard.
INSERT INTO public.subscription_plans (
  tier, display_name, price_cents, billing_period,
  insider_connections_monthly_limit, company_research_monthly_limit,
  job_evaluations_daily_limit, llm_unlocked, feature_bullets,
  email_lookup_monthly_limit, daily_action_limits
) VALUES (
  'ace', 'Ace', 2900, 'month',
  15, 50,
  NULL, true,
  '["Unlimited job evaluations", "Unlimited AI rewrites, drafts, and interview prep", "Higher search, résumé, and lookup caps than Command", "15 insider connection lookups/mo, 50 company research runs/mo"]'::jsonb,
  40,
  '{
    "search": 25,
    "document_generation": 45,
    "resume_extract": 30,
    "resume_analysis": 80,
    "resume_quality_analysis": 18,
    "bullet_rewrite": null,
    "rejection_intelligence": 40,
    "strategic_moat": 20,
    "interviewer_research": 25,
    "leverage_synthesis": 40,
    "interview_question_bank": null,
    "trap_door_prediction": 40,
    "interrogation_plan": 40,
    "star_story_matching": 40,
    "question_detail_generation": null,
    "practice_kit_generation": null,
    "agent_message": null,
    "outcome_narrative": 40,
    "brag_doc": 40,
    "market_readiness": 40,
    "extension_score_preview": 500,
    "referral_message": null,
    "negotiation_script": 40,
    "email_draft": null,
    "outreach_message": null,
    "jd_decoder": 40,
    "ninety_day_plan": 40,
    "skill_gap_synthesis": 40,
    "pipeline_strategy_read": 40
  }'::jsonb
);
