-- Affiliate program, direct user request 2026-08-30 (completing the
-- "never built" backlog). Distinct from the existing peer-referral system
-- (profiles.referral_code/referred_by_code, an in-app usage-multiplier
-- reward) — this is real cash commission for external marketing partners,
-- paid out manually via PayPal Payouts (decision made this session:
-- PayPal over Stripe Connect, since InsForge's Stripe integration has zero
-- Connect/marketplace-payout support and PayPal needs no per-affiliate
-- KYC onboarding).
--
-- Commission model, a real scoping decision: ONE-TIME commission on a
-- referred user's FIRST-EVER paid conversion, not recurring on every
-- renewal — simpler, matches most affiliate programs, and avoids
-- affiliate_conversions growing one row per renewal per subscriber
-- forever. Detected by checking whether user_subscriptions already had a
-- row for this user BEFORE this invoice.paid event upserts it (that table
-- is one-row-per-user, upserted on every invoice including renewals).

ALTER TABLE public.profiles
  ADD COLUMN affiliate_referred_by_code TEXT NULL;

CREATE TABLE public.affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_code TEXT NOT NULL UNIQUE,
  paypal_email TEXT NOT NULL,
  -- Admin-set per affiliate (not a global rate) — 0.20 = 20% of the
  -- charged amount. Defaults to 20% on application; an admin reviews and
  -- can change it before or after approving.
  commission_rate NUMERIC NOT NULL DEFAULT 0.20 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

-- An affiliate can see their own application/status and apply once
-- (self-service, status always starts 'pending' — cannot self-approve).
-- No client-writable UPDATE at all: rate/status changes and even a
-- PayPal-email correction go through admin actions only, for now — same
-- "manual, no automation" spirit already chosen for the payout itself.
CREATE POLICY affiliates_select_own ON public.affiliates
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY affiliates_insert_own ON public.affiliates
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending');

CREATE TABLE public.affiliate_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  amount_charged_cents INTEGER NOT NULL,
  commission_cents INTEGER NOT NULL,
  paid_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referred_user_id)
);

ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;

-- An affiliate can see their own conversions/balance (their dashboard) —
-- no client-writable policy at all, every row here is written by the
-- SECURITY DEFINER trigger below (real conversions) or an admin action
-- (marking paid_at once a real PayPal payout is sent).
CREATE POLICY affiliate_conversions_select_own ON public.affiliate_conversions
  FOR SELECT TO authenticated USING (
    affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = (SELECT auth.uid()))
  );

-- Extends the existing Stripe fulfillment trigger (unchanged branches
-- collapsed below to keep the diff to just the new logic) — after the
-- existing invoice.paid handling resolves v_subject_id/v_tier and BEFORE
-- upserting user_subscriptions, checks whether this user already had a
-- subscription row (first-conversion detection), and if not, whether
-- they have an approved affiliate's code on their profile — if so,
-- records a real commission conversion from the invoice's own actual
-- charged amount (not the plan's list price, which regional pricing can
-- differ from).
CREATE OR REPLACE FUNCTION public.fulfill_stripe_subscription_event()
RETURNS TRIGGER AS $$
DECLARE
  v_subject_id TEXT;
  v_customer_id TEXT;
  v_price_id TEXT;
  v_tier TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_had_prior_subscription BOOLEAN;
  v_amount_cents INTEGER;
  v_affiliate_code TEXT;
  v_affiliate RECORD;
BEGIN
  IF NEW.provider <> 'stripe' OR NEW.processing_status <> 'processed' THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'invoice.paid' THEN
    v_subject_id := COALESCE(
      NEW.payload -> 'data' -> 'object' -> 'parent' -> 'subscription_details' -> 'metadata' ->> 'insforge_subject_id',
      NEW.payload -> 'data' -> 'object' -> 'metadata' ->> 'insforge_subject_id'
    );
    v_customer_id := NEW.payload -> 'data' -> 'object' ->> 'customer';

    IF v_subject_id IS NULL AND v_customer_id IS NOT NULL THEN
      SELECT m.subject_id INTO v_subject_id
      FROM payments.customer_mappings m
      WHERE m.provider = NEW.provider
        AND m.environment = NEW.environment
        AND m.provider_customer_id = v_customer_id
        AND m.subject_type = 'user';
    END IF;

    IF v_subject_id IS NULL THEN
      RAISE WARNING 'Stripe invoice.paid event % has no resolvable Sortie user', NEW.provider_event_id;
      RETURN NEW;
    END IF;

    v_price_id := NEW.payload -> 'data' -> 'object' -> 'lines' -> 'data' -> 0 -> 'price' ->> 'id';
    SELECT tier INTO v_tier FROM public.subscription_plans
    WHERE stripe_price_id = v_price_id
       OR EXISTS (
         SELECT 1 FROM jsonb_each(regional_prices) AS rp(region, cfg)
         WHERE cfg ->> 'stripePriceId' = v_price_id
       );

    IF v_tier IS NULL THEN
      RAISE WARNING 'Stripe invoice.paid event % has an unrecognized price %', NEW.provider_event_id, v_price_id;
      RETURN NEW;
    END IF;

    v_period_start := to_timestamp((NEW.payload -> 'data' -> 'object' -> 'lines' -> 'data' -> 0 -> 'period' ->> 'start')::bigint);
    v_period_end := to_timestamp((NEW.payload -> 'data' -> 'object' -> 'lines' -> 'data' -> 0 -> 'period' ->> 'end')::bigint);

    SELECT EXISTS(SELECT 1 FROM public.user_subscriptions WHERE user_id = v_subject_id::uuid) INTO v_had_prior_subscription;

    INSERT INTO public.user_subscriptions
      (user_id, tier, status, current_period_start, current_period_end, payment_customer_id, updated_at)
    VALUES
      (v_subject_id::uuid, v_tier, 'active', v_period_start, v_period_end, v_customer_id, now())
    ON CONFLICT (user_id) DO UPDATE SET
      tier = EXCLUDED.tier,
      status = 'active',
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      payment_customer_id = EXCLUDED.payment_customer_id,
      updated_at = now();

    -- Affiliate commission — first conversion only, real charged amount.
    IF NOT v_had_prior_subscription THEN
      SELECT affiliate_referred_by_code INTO v_affiliate_code
      FROM public.profiles WHERE id = v_subject_id::uuid;

      IF v_affiliate_code IS NOT NULL THEN
        SELECT * INTO v_affiliate FROM public.affiliates
        WHERE affiliate_code = v_affiliate_code AND status = 'approved';

        IF FOUND THEN
          v_amount_cents := (NEW.payload -> 'data' -> 'object' -> 'lines' -> 'data' -> 0 ->> 'amount')::integer;

          INSERT INTO public.affiliate_conversions
            (affiliate_id, referred_user_id, tier, amount_charged_cents, commission_cents)
          VALUES
            (v_affiliate.id, v_subject_id::uuid, v_tier, v_amount_cents, round(v_amount_cents * v_affiliate.commission_rate))
          ON CONFLICT (referred_user_id) DO NOTHING;
        END IF;
      END IF;
    END IF;

  ELSIF NEW.event_type = 'invoice.payment_failed' THEN
    v_subject_id := COALESCE(
      NEW.payload -> 'data' -> 'object' -> 'parent' -> 'subscription_details' -> 'metadata' ->> 'insforge_subject_id',
      NEW.payload -> 'data' -> 'object' -> 'metadata' ->> 'insforge_subject_id'
    );

    IF v_subject_id IS NOT NULL THEN
      UPDATE public.user_subscriptions
      SET status = 'past_due', updated_at = now()
      WHERE user_id = v_subject_id::uuid;
    END IF;

  ELSIF NEW.event_type = 'customer.subscription.deleted' THEN
    v_subject_id := NEW.payload -> 'data' -> 'object' -> 'metadata' ->> 'insforge_subject_id';
    v_customer_id := NEW.payload -> 'data' -> 'object' ->> 'customer';

    IF v_subject_id IS NULL AND v_customer_id IS NOT NULL THEN
      SELECT m.subject_id INTO v_subject_id
      FROM payments.customer_mappings m
      WHERE m.provider = NEW.provider
        AND m.environment = NEW.environment
        AND m.provider_customer_id = v_customer_id
        AND m.subject_type = 'user';
    END IF;

    IF v_subject_id IS NOT NULL THEN
      UPDATE public.user_subscriptions
      SET tier = 'recon', status = 'canceled', updated_at = now()
      WHERE user_id = v_subject_id::uuid;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
