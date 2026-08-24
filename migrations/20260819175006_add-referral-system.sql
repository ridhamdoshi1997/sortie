-- Phase 18 item 3/4: Referral system (new build) + the AI-personalized
-- referral copy that depends on it. referral_code is generated lazily on
-- first Settings visit (actions/referrals.ts), not defaulted here, so app
-- code owns the real human-readable-code + collision-retry logic rather
-- than a DB-side generator. referred_by_code is captured once, client-side,
-- right after a fresh signup notices a pending ?ref= code in localStorage
-- (auth.users rows are auto-provisioned with nothing but id — see
-- 20260721040000_auto-provision-profiles.sql — so there is no signup-time
-- hook to capture it any earlier).
ALTER TABLE public.profiles ADD COLUMN referral_code TEXT UNIQUE;
ALTER TABLE public.profiles ADD COLUMN referred_by_code TEXT;

-- One reward row per successfully-referred user (UNIQUE on referred_id) —
-- the idempotency guard against ever double-rewarding the same referral.
-- Only created once the REFERRED user completes their profile
-- (is_complete = true), not on bare signup, so an abandoned OAuth click
-- can't be farmed for reward.
CREATE TABLE public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  multiplier_bump NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX referral_rewards_referrer_id_idx ON public.referral_rewards(referrer_id);

-- Same lockdown as every other admin/system-owned table — RLS enabled, zero
-- policies. Reads for a user's own referral stats go through a Server
-- Action using the service-role client (actions/referrals.ts), same
-- pattern as user_api_keys/usage_daily reads elsewhere in this app.
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;
