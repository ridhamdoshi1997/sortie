-- Handles Stripe's "pause payment collection" Customer Portal feature
-- (direct user question: "how do we know from the Stripe dashboard" —
-- the honest answer was "we don't yet," this closes that gap). Stripe has
-- no dedicated "paused" event; it fires customer.subscription.updated with
-- pause_collection set/cleared on the subscription object. The trigger
-- previously ignored this event type entirely — a paused user kept full
-- access with no server-side awareness at all.
ALTER TABLE public.user_subscriptions DROP CONSTRAINT user_subscriptions_status_check;
ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check CHECK (status IN ('active', 'canceled', 'past_due', 'paused'));

CREATE OR REPLACE FUNCTION public.fulfill_stripe_subscription_event()
RETURNS TRIGGER AS $$
DECLARE
  v_subject_id TEXT;
  v_customer_id TEXT;
  v_price_id TEXT;
  v_tier TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_pause_collection JSONB;
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

    -- A real invoice.paid on a currently-paused subscription (e.g. a
    -- resumed subscription's first post-resume invoice) is a genuine
    -- un-pause — 'active' is correct here, overriding a stale 'paused'
    -- status, same as it already overrides 'past_due' on a successful
    -- retry payment.
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

  ELSIF NEW.event_type = 'customer.subscription.updated' THEN
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
      RETURN NEW;
    END IF;

    v_pause_collection := NEW.payload -> 'data' -> 'object' -> 'pause_collection';

    IF v_pause_collection IS NOT NULL AND v_pause_collection <> 'null'::jsonb THEN
      -- Paused: the circuit breakers in lib/subscription.ts key entirely
      -- off `tier`, not `status`, so a paused user keeps their plan's
      -- limits by default unless call sites are updated to also check
      -- status <> 'paused' — a real, disclosed follow-up, not silently
      -- assumed handled by this migration alone.
      UPDATE public.user_subscriptions
      SET status = 'paused', updated_at = now()
      WHERE user_id = v_subject_id::uuid AND status <> 'canceled';
    ELSE
      -- Resumed (pause_collection cleared) — only overwrite a genuinely
      -- 'paused' row, never a 'canceled' or 'past_due' one this event
      -- wasn't actually about.
      UPDATE public.user_subscriptions
      SET status = 'active', updated_at = now()
      WHERE user_id = v_subject_id::uuid AND status = 'paused';
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
