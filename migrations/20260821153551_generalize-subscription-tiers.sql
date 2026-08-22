-- Generalizes tier from a fixed recon/command enum to an admin-managed,
-- addable/removable set of plans. subscription_plans.tier is now just a
-- slug primary key (no CHECK), and user_subscriptions.tier references it
-- via a real foreign key instead of duplicating a hardcoded value list —
-- a plan created or renamed from /admin is immediately valid everywhere
-- without a second migration. No ON DELETE clause is intentional: a plan
-- currently in use by a real subscriber must not be deletable (the FK
-- blocks it with a clear constraint-violation error) — an admin has to
-- migrate those users to a different plan first.
ALTER TABLE public.subscription_plans DROP CONSTRAINT subscription_plans_tier_check;

ALTER TABLE public.user_subscriptions DROP CONSTRAINT user_subscriptions_tier_check;

ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT user_subscriptions_tier_fkey FOREIGN KEY (tier) REFERENCES public.subscription_plans(tier);
