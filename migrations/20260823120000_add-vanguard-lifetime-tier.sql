-- Vanguard: a $149 one-time "lifetime deal" tier, direct user request, to
-- generate immediate cash flow. Shares Command's exact monthly-rolling
-- limits (7 insider connections, 25 company research, unlimited job
-- evaluations, LLM unlocked) — nothing new needed in lib/subscription.ts's
-- circuit breakers, they already read every limit generically off whichever
-- plan row a user is on. What IS new: a hard global cap of 250 seats ever,
-- enforced race-safely against concurrent Stripe payments, and a one-time
-- (not recurring) Stripe Checkout/fulfillment path alongside the existing
-- subscription one.
--
-- Stripe product/price created via the CLI first, same convention as
-- Command's own seeding (see add-stripe-billing.sql's header comment):
-- `npx @insforge/cli payments stripe products create --environment test
-- --name "Vanguard"` -> prod_V7iWVg1rwlArDT, then `prices create
-- --unit-amount 14900` (no --interval = one-time Price) ->
-- price_1U7T5XQIPDGVmA612XZuyXHN.

ALTER TABLE public.subscription_plans DROP CONSTRAINT subscription_plans_billing_period_check;
ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_billing_period_check CHECK (billing_period IN ('month', 'year', 'lifetime'));

-- max_seats NULL means unlimited (every existing plan) — only a scarcity
-- tier like Vanguard sets it. seats_claimed is the atomic counter itself;
-- claim_plan_seat() below increments it with a single-row UPDATE, which
-- Postgres serializes via row-level locking — the same "no separate
-- counter table needed" pattern as any single-row config table in this
-- schema, just with a WHERE clause that can fail closed once the cap is
-- hit.
ALTER TABLE public.subscription_plans ADD COLUMN max_seats INTEGER;
ALTER TABLE public.subscription_plans ADD COLUMN seats_claimed INTEGER NOT NULL DEFAULT 0;

INSERT INTO public.subscription_plans
  (tier, display_name, price_cents, billing_period, insider_connections_monthly_limit, company_research_monthly_limit, job_evaluations_daily_limit, llm_unlocked, feature_bullets, stripe_price_id, max_seats)
VALUES
  ('vanguard', 'Vanguard', 14900, 'lifetime', 7, 25, NULL, true,
   '["Lifetime access, pay once", "Everything in Command, forever", "Unlimited AI job evaluations", "GPT-4o & Claude unlocked", "7 insider connection lookups/month", "25 company research briefings/month", "Limited to 250 seats, ever"]'::jsonb,
   'price_1U7T5XQIPDGVmA612XZuyXHN', 250)
ON CONFLICT (tier) DO NOTHING;

-- Append-only claim ledger — deliberately decoupled from user_subscriptions
-- (which tracks a user's CURRENT plan and can in principle be changed by an
-- admin override or a future migration off the tier) so the scarcity count
-- can never be inflated or quietly freed back up by anything other than a
-- real, once-ever Stripe payment. UNIQUE(tier, user_id) makes a duplicate
-- webhook delivery for the same purchase idempotent instead of double-
-- claiming a seat; UNIQUE(tier, seat_number) is a second, redundant
-- guarantee against the same bug the atomic counter is already designed to
-- prevent.
CREATE TABLE public.plan_seat_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier TEXT NOT NULL REFERENCES public.subscription_plans(tier),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seat_number INTEGER NOT NULL,
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tier, user_id),
  UNIQUE (tier, seat_number)
);

-- No public policy — this is an internal ledger (payment IDs, exact claim
-- order), not marketing content. The public scarcity progress bar reads
-- subscription_plans.seats_claimed/max_seats instead, both already covered
-- by that table's existing "anyone can view plan config" policy.
ALTER TABLE public.plan_seat_claims ENABLE ROW LEVEL SECURITY;

-- Race-safe seat claim. The UPDATE's WHERE clause is the entire mechanism:
-- concurrent callers serialize on the single subscription_plans row's lock,
-- so at most `max_seats` calls will ever see their UPDATE match a row and
-- get a seat back — the (max_seats + 1)th caller's UPDATE simply matches
-- zero rows and v_seat stays NULL, a clean "sold out" rather than a race.
-- Idempotent: a user who already holds a seat for this tier (e.g. a
-- redelivered webhook) gets their existing seat number back, never a
-- second claim.
CREATE OR REPLACE FUNCTION public.claim_plan_seat(
  p_tier TEXT,
  p_user_id UUID,
  p_checkout_session_id TEXT,
  p_payment_intent_id TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_existing INTEGER;
  v_seat INTEGER;
BEGIN
  SELECT seat_number INTO v_existing FROM public.plan_seat_claims WHERE tier = p_tier AND user_id = p_user_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_seat := NULL;
  UPDATE public.subscription_plans
  SET seats_claimed = seats_claimed + 1
  WHERE tier = p_tier AND max_seats IS NOT NULL AND seats_claimed < max_seats
  RETURNING seats_claimed INTO v_seat;

  IF v_seat IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.plan_seat_claims (tier, user_id, seat_number, stripe_checkout_session_id, stripe_payment_intent_id)
  VALUES (p_tier, p_user_id, v_seat, p_checkout_session_id, p_payment_intent_id)
  ON CONFLICT (tier, user_id) DO NOTHING;

  RETURN v_seat;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

-- One-time-purchase fulfillment (skills/insforge/payments/stripe.md's "One-
-- Time Fulfillment" pattern) — separate trigger function from
-- fulfill_stripe_subscription_event, since a one-time Checkout has no
-- invoice/subscription object at all, just a Checkout Session in
-- mode='payment'. Reads insforge_subject_id straight off the session's own
-- metadata (unlike the subscription path, a one-time session's metadata
-- isn't nested under parent.subscription_details) and reads which plan was
-- bought from a second metadata key (`plan_tier`) stamped at checkout time
-- in actions/billing.ts, rather than reverse-mapping a Price ID — there's
-- no line-item array to read one from on a Checkout Session webhook
-- payload the way an invoice has one.
CREATE OR REPLACE FUNCTION public.fulfill_stripe_one_time_purchase()
RETURNS TRIGGER AS $$
DECLARE
  v_subject_id TEXT;
  v_customer_id TEXT;
  v_tier TEXT;
  v_max_seats INTEGER;
  v_seat INTEGER;
  v_checkout_session_id TEXT;
  v_payment_intent_id TEXT;
BEGIN
  IF NEW.provider <> 'stripe' OR NEW.processing_status <> 'processed' OR NEW.event_type <> 'checkout.session.completed' THEN
    RETURN NEW;
  END IF;

  IF (NEW.payload -> 'data' -> 'object' ->> 'mode') <> 'payment' THEN
    RETURN NEW; -- subscription checkouts are fulfilled from invoice.paid instead
  END IF;

  v_tier := NEW.payload -> 'data' -> 'object' -> 'metadata' ->> 'plan_tier';
  IF v_tier IS NULL THEN
    RETURN NEW; -- some other one-time checkout this app runs, not a plan purchase
  END IF;

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

  IF v_subject_id IS NULL THEN
    RAISE WARNING 'Stripe one-time checkout.session.completed event % (tier %) has no resolvable Sortie user', NEW.provider_event_id, v_tier;
    RETURN NEW;
  END IF;

  v_checkout_session_id := NEW.payload -> 'data' -> 'object' ->> 'id';
  v_payment_intent_id := NEW.payload -> 'data' -> 'object' ->> 'payment_intent';

  SELECT max_seats INTO v_max_seats FROM public.subscription_plans WHERE tier = v_tier;

  IF v_max_seats IS NOT NULL THEN
    v_seat := public.claim_plan_seat(v_tier, v_subject_id::uuid, v_checkout_session_id, v_payment_intent_id);
    IF v_seat IS NULL THEN
      -- A real possible race the pre-checkout seat check in
      -- actions/billing.ts can't fully close (two people can both pass
      -- that check before either finishes paying) — the customer HAS been
      -- charged by Stripe at this point, so this must never be silently
      -- dropped. Flagged for a manual refund, never granted past the cap.
      RAISE WARNING 'Vanguard seat sold out at fulfillment — Stripe checkout % (user %) was paid but no seat remained, needs a manual refund', NEW.provider_event_id, v_subject_id;
      RETURN NEW;
    END IF;
  END IF;

  -- Lifetime access has no recurring Stripe invoice to roll the counter
  -- period forward, so current_period_end is seeded 1 month out here and
  -- then kept rolling forward by the reset-vanguard-usage-period Inngest
  -- cron (lib/inngest/functions.ts) for as long as the plan stays active —
  -- same monthly-rolling semantics api_usage_metrics already assumes for
  -- every other plan, just driven by a cron instead of a webhook.
  INSERT INTO public.user_subscriptions
    (user_id, tier, status, current_period_start, current_period_end, payment_customer_id, updated_at)
  VALUES
    (v_subject_id::uuid, v_tier, 'active', now(), now() + interval '1 month', v_customer_id, now())
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    status = 'active',
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    payment_customer_id = EXCLUDED.payment_customer_id,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;

CREATE TRIGGER fulfill_stripe_one_time_purchase
  AFTER INSERT OR UPDATE ON payments.webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fulfill_stripe_one_time_purchase();
