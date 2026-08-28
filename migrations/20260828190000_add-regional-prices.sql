-- Country/region-aware pricing, Phase 1 (Stripe-only) — direct user request,
-- 2026-08-28. Emphasis on the Indian subcontinent (India/Pakistan/Sri Lanka/
-- Bangladesh) given population/price-sensitivity, but the mechanism is
-- generic — any ISO country code can be mapped to a region key with its own
-- price, see lib/regionalPricing.ts's COUNTRY_REGION_KEY.
--
-- Same "flat per-plan JSONB override map, admin overwrites the whole thing
-- on save" pattern this table already uses twice (daily_action_limits,
-- feature_bullets) — no new RLS, no new admin CRUD actions, lands in the
-- same updatePlan() call as everything else. Shape:
--   { "<region_key>": { "price_cents": 74900, "currency": "inr", "stripe_price_id": "price_..." } }
-- Absent region key (or absent stripe_price_id within one) falls back to
-- the plan's existing base price_cents/stripe_price_id columns — additive,
-- byte-identical to today until an admin explicitly fills one in.
ALTER TABLE public.subscription_plans
  ADD COLUMN regional_prices JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Real bug fixed here, before any regional Price is ever wired up:
-- fulfill_stripe_subscription_event() resolved which plan to grant on
-- invoice.paid by matching the invoice's Stripe Price ID against ONLY
-- subscription_plans.stripe_price_id (the base US price). Once a regional
-- Stripe Price exists, a renewal/purchase on that Price would never match,
-- hit the "unrecognized price" WARNING branch, and the customer would be
-- charged but never granted the plan — silently. Now also checks each
-- plan's regional_prices for a matching embedded stripe_price_id.
CREATE OR REPLACE FUNCTION public.fulfill_stripe_subscription_event()
RETURNS TRIGGER AS $$
DECLARE
  v_subject_id TEXT;
  v_customer_id TEXT;
  v_price_id TEXT;
  v_tier TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
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
    -- cfg ->> 'stripePriceId', camelCase: regional_prices' nested keys are
    -- never transformed on write (actions/admin.ts passes PlanInput.
    -- regionalPrices straight through as JS objects), so the real stored
    -- shape is camelCase, not the snake_case every top-level column uses.
    -- Confirmed live (2026-08-28) — an earlier snake_case version of this
    -- query silently matched nothing against real data, which would have
    -- meant every regional renewal fell into the same "unrecognized price"
    -- WARNING branch this whole fix exists to close.
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
