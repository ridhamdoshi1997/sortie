-- Real bug found via a genuine live test-mode purchase, not guessed: the
-- invoice.paid line item's price lives at
-- lines.data[0].pricing.price_details.price (a direct string) on this
-- Stripe API version, NOT lines.data[0].price.id as originally written in
-- add-stripe-billing's fulfill_stripe_subscription_event(). The wrong path
-- resolved to NULL, so the tier lookup (WHERE stripe_price_id = NULL)
-- never matched, and the function silently hit its own "unrecognized
-- price" RAISE WARNING branch and returned without ever writing to
-- user_subscriptions — confirmed live: a completed $15 test-mode Stripe
-- Checkout left payments.webhook_events correctly marked "processed" but
-- user_subscriptions stayed empty. Everything else in the function
-- (subject_id resolution via parent.subscription_details.metadata, the
-- period.start/period.end extraction) was confirmed correct against the
-- real payload and is unchanged here.
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

    v_price_id := NEW.payload -> 'data' -> 'object' -> 'lines' -> 'data' -> 0 -> 'pricing' -> 'price_details' ->> 'price';
    SELECT tier INTO v_tier FROM public.subscription_plans WHERE stripe_price_id = v_price_id;

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

-- No backfill here — payments.webhook_events is an InsForge-managed table;
-- migrations run as project_admin, which cannot write to it directly (RLS
-- denies it, confirmed live). The two real test purchases already made
-- this session are backfilled separately via a plain db query INSERT into
-- the app-owned user_subscriptions table instead — see the session notes,
-- not this migration.
