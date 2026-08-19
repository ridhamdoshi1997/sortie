-- Push notifications (admin console expansion item 6, context/RESUME.md) —
-- a second Marketing broadcast channel alongside email. Unlike email,
-- genuinely usable today: Web Push + VAPID needs no external account or
-- verified domain, just the generated keypair (see .env's own comment).

CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);

-- Real RLS, same reasoning as support_tickets — a user manages their own
-- push subscriptions from their own browser through the regular
-- cookie-authenticated client, this isn't admin-owned data.
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
