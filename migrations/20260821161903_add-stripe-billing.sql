-- Real Stripe checkout/billing wiring for the subscription model built in
-- the prior 3 migrations. Test-mode Stripe is connected (see
-- `npx @insforge/cli payments stripe status`); a "Command" Product/Price
-- ($15/month, price_1U6v9OQIPDGVmA61Se54GaWf) already exists in Stripe test
-- mode, created via the CLI, not this migration (catalog objects aren't
-- schema).

-- Maps a plan to the Stripe Price that sells it — nullable, since the
-- seeded "recon" (free) plan has no Price at all, and a future paid plan
-- an owner creates from /admin/billing won't have one until they set it.
ALTER TABLE public.subscription_plans ADD COLUMN stripe_price_id TEXT;

UPDATE public.subscription_plans
SET stripe_price_id = 'price_1U6v9OQIPDGVmA61Se54GaWf'
WHERE tier = 'command';

-- RLS for the Stripe runtime authorization tables (skills/insforge/payments/stripe.md's
-- own reference shape) — user-owned billing, subject_type='user',
-- subject_id=auth.uid()::text. Without these, checkout/portal session
-- creation is blocked for every authenticated user by RLS's own default-deny.
ALTER TABLE payments.stripe_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments.stripe_customer_portal_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users create their stripe checkout sessions"
ON payments.stripe_checkout_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  subject_type = 'user'
  AND subject_id = (SELECT auth.uid())::text
);

CREATE POLICY "users read their stripe checkout sessions"
ON payments.stripe_checkout_sessions
FOR SELECT
TO authenticated
USING (
  subject_type = 'user'
  AND subject_id = (SELECT auth.uid())::text
);

CREATE POLICY "users create their stripe portal sessions"
ON payments.stripe_customer_portal_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  subject_type = 'user'
  AND subject_id = (SELECT auth.uid())::text
);

CREATE POLICY "users read their stripe portal sessions"
ON payments.stripe_customer_portal_sessions
FOR SELECT
TO authenticated
USING (
  subject_type = 'user'
  AND subject_id = (SELECT auth.uid())::text
);

-- Durable fulfillment, triggered from payments.webhook_events (never a
-- Checkout success URL, never payments.transactions — both are UX/reporting
-- only per skills/insforge/payments/stripe.md). Two events handled:
--
-- invoice.paid: the real "grant or renew access" moment for a subscription
-- — fires on the initial subscription purchase AND every renewal. Resolves
-- the Sortie user_id from the metadata InsForge stamps at checkout time
-- (subject.id), snapshotted onto the invoice at
-- parent.subscription_details.metadata per Stripe's own behavior for
-- subscription-generated invoices; falls back to payments.customer_mappings
-- if that's somehow missing (matches the guide's own resolution order).
-- Resolves WHICH plan to grant by matching the invoice's actual Price back
-- to subscription_plans.stripe_price_id, not a hardcoded 'command' — so a
-- second paid plan an owner adds later (with its own Stripe Price) routes
-- correctly without touching this trigger again.
--
-- customer.subscription.deleted: real cancellation — reverts to the
-- 'recon' free tier. 'recon' is a safe, permanent app-level constant here
-- (not user-configurable), matching lib/subscription.ts's own
-- SAFE_FALLBACK_PLAN convention for "what a user gets with no active paid
-- entitlement."
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
      -- Grace period, not an immediate downgrade — the plan/limits stay as-is
      -- while past_due, same real-world SaaS convention Stripe itself
      -- recommends (retry the card before revoking access).
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

CREATE TRIGGER fulfill_stripe_subscription_event
  AFTER INSERT OR UPDATE ON payments.webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fulfill_stripe_subscription_event();
