-- referral_rewards started zero-policy/service-role-only like every other
-- admin-owned table this stretch, but a user's own referral count IS
-- genuinely user-facing data (Settings -> Referrals stats), same shape as
-- application_events/interview_events/compensation_events having real
-- owner-scoped SELECT policies. Read-only — writes stay service-role only
-- (actions/referrals.ts's claimReferralCode uses the admin client), a user
-- must never be able to grant themselves a reward directly.
CREATE POLICY referral_rewards_select_own_as_referrer ON public.referral_rewards
  FOR SELECT USING (auth.uid() = referrer_id);
