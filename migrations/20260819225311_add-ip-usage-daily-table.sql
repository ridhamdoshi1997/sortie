-- Free ATS score checker (build-plan.md §I, no-login lead magnet) — the
-- first genuinely public, unauthenticated AI-calling surface in this app.
-- lib/rateLimit.ts's existing rate_limit table is keyed by user_id (FK'd to
-- auth.users), unusable for anonymous traffic — this is the IP-keyed
-- equivalent, same day-bucket shape as usage_daily rather than a sliding
-- window, since a public tool only needs a simple daily abuse cap, not
-- burst protection.
CREATE TABLE public.ip_usage_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip TEXT NOT NULL,
  route TEXT NOT NULL,
  day DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  UNIQUE (ip, route, day)
);

CREATE INDEX ip_usage_daily_lookup_idx ON public.ip_usage_daily(ip, route, day);

-- No user session exists on this path at all, so every read/write goes
-- through the service-role client from the route handler — RLS enabled,
-- zero policies, same lockdown as every other server-only table.
ALTER TABLE public.ip_usage_daily ENABLE ROW LEVEL SECURITY;
