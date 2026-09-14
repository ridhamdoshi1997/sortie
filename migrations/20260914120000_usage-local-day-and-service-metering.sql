-- Phase 54 — usage resets at the USER'S midnight, and every AI action is metered.
--
-- Three problems, one migration:
--
-- 1. The daily `day` key was `(now() AT TIME ZONE 'utc')::date`. For a user in
--    Toronto that is 8pm (7pm in winter): their allowance "reset" mid-evening
--    and Settings told them "Resets at midnight UTC", a clock nobody lives on.
--    The day is now computed in the timezone stored on their profile, which
--    the browser reports (components/settings/TimezoneSync.tsx).
--
-- 2. Background work could not be metered at all. Both RPCs read auth.uid(),
--    and a service-role client has no user — verified live 2026-09-14:
--    record_usage_daily called with the service key raised "not authenticated"
--    and wrote nothing. That silently broke two features, not just metering:
--      * the accomplishment -> résumé-suggestion Inngest job called
--        checkAndConsumeUsage with the admin client, so every non-admin user's
--        suggestion was refused as "Something went wrong checking your limit";
--      * /api/extension/score-preview did the same, so the extension's match
--        badge 429'd for every user on a cache miss.
--    The *_for(p_user_id, ...) variants below take the user explicitly and are
--    executable by service_role ONLY.
--
-- 3. record_usage_daily could only add 1. Search-time scoring is metered per
--    job, and one search queues up to 120, so it takes an amount.
--
-- Quota-gaming bound on the timezone: a user who moves their timezone forward
-- can open a new local day early. The trigger below allows one change per 24h
-- (service_role exempt), so the most anyone can gain is one extra day's
-- allowance per day of waiting — and moving back lands on a day already
-- counted, so it gains nothing.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS timezone_updated_at timestamptz;

-- Validates and throttles every write to profiles.timezone, whichever path it
-- takes — the RPC below, or a direct PostgREST PATCH on the user's own row.
-- An invalid name would otherwise make every usage RPC raise on
-- `AT TIME ZONE`, locking that user out of every AI feature.
--
-- current_setting('role') rather than current_user: PostgREST sets the role
-- GUC per request, and SECURITY DEFINER (set_my_timezone) changes
-- current_user but NOT that setting — so a user calling the definer RPC is
-- still correctly seen as `authenticated`.
CREATE OR REPLACE FUNCTION public.profiles_timezone_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.timezone IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone) THEN
        RAISE EXCEPTION 'invalid timezone: %', NEW.timezone USING ERRCODE = '22023';
      END IF;
      NEW.timezone_updated_at := now();
    ELSE
      NEW.timezone_updated_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Unchanged timezone: pin the timestamp too, so it cannot be backdated to
  -- dodge the throttle.
  IF NEW.timezone IS NOT DISTINCT FROM OLD.timezone THEN
    NEW.timezone_updated_at := OLD.timezone_updated_at;
    RETURN NEW;
  END IF;

  IF NEW.timezone IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'invalid timezone: %', NEW.timezone USING ERRCODE = '22023';
  END IF;

  IF OLD.timezone IS NOT NULL
     AND OLD.timezone_updated_at > now() - interval '24 hours'
     AND COALESCE(current_setting('role', true), '') <> 'service_role' THEN
    -- Kept, not raised: a profile save must never fail because the browser
    -- happened to report a new zone twice in one day.
    NEW.timezone := OLD.timezone;
    NEW.timezone_updated_at := OLD.timezone_updated_at;
  ELSE
    NEW.timezone_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_timezone_guard ON public.profiles;
CREATE TRIGGER profiles_timezone_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_timezone_guard();

-- The single source of "which day is it for this user". Everything below, and
-- actions/usageStats.ts via my_usage_window, reads the day from here.
CREATE OR REPLACE FUNCTION public.usage_local_day(p_user_id uuid)
RETURNS TABLE(day date, resets_at timestamptz, timezone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tz text;
  v_day date;
BEGIN
  SELECT p.timezone INTO v_tz FROM public.profiles p WHERE p.id = p_user_id;
  v_tz := COALESCE(v_tz, 'UTC');
  v_day := (now() AT TIME ZONE v_tz)::date;
  RETURN QUERY SELECT v_day, ((v_day + 1)::timestamp AT TIME ZONE v_tz), v_tz;
END;
$$;

CREATE OR REPLACE FUNCTION public.my_usage_window()
RETURNS TABLE(day date, resets_at timestamptz, timezone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN QUERY SELECT * FROM public.usage_local_day(v_user_id);
END;
$$;

-- Atomic check-and-increment. The previous body read the count and then
-- upserted, which two concurrent requests could both pass; the conditional
-- ON CONFLICT ... WHERE makes the cap check part of the write itself.
CREATE OR REPLACE FUNCTION public._usage_increment(p_user_id uuid, p_action text, p_limit integer)
RETURNS TABLE(new_count integer, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_today date;
  v_count integer;
BEGIN
  SELECT u.day INTO v_today FROM public.usage_local_day(p_user_id) u;

  -- A limit of 0 blocks the day's first call too (migration 20260911180000),
  -- and must never create a row.
  IF p_limit <= 0 THEN
    SELECT ud.count INTO v_count FROM public.usage_daily ud
      WHERE ud.user_id = p_user_id AND ud.day = v_today AND ud.action = p_action;
    RETURN QUERY SELECT COALESCE(v_count, 0), false;
    RETURN;
  END IF;

  INSERT INTO public.usage_daily AS ud (user_id, day, action, count)
  VALUES (p_user_id, v_today, p_action, 1)
  ON CONFLICT (user_id, day, action)
  DO UPDATE SET count = ud.count + 1 WHERE ud.count < p_limit
  RETURNING ud.count INTO v_count;

  IF FOUND THEN
    RETURN QUERY SELECT v_count, true;
    RETURN;
  END IF;

  SELECT ud.count INTO v_count FROM public.usage_daily ud
    WHERE ud.user_id = p_user_id AND ud.day = v_today AND ud.action = p_action;
  RETURN QUERY SELECT COALESCE(v_count, 0), false;
END;
$$;

CREATE OR REPLACE FUNCTION public._usage_record(p_user_id uuid, p_action text, p_amount integer)
RETURNS TABLE(new_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_today date;
  v_count integer;
BEGIN
  -- A negative amount would be a quota reset by another name.
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'p_amount must be between 1 and 1000' USING ERRCODE = '22023';
  END IF;

  SELECT u.day INTO v_today FROM public.usage_local_day(p_user_id) u;

  INSERT INTO public.usage_daily AS ud (user_id, day, action, count)
  VALUES (p_user_id, v_today, p_action, p_amount)
  ON CONFLICT (user_id, day, action)
  DO UPDATE SET count = ud.count + p_amount
  RETURNING ud.count INTO v_count;

  RETURN QUERY SELECT v_count;
END;
$$;

-- User-scoped wrappers (cookie client, auth.uid()). Same names and result
-- shapes as before, so lib/usage.ts and the verify script keep working.
CREATE OR REPLACE FUNCTION public.increment_usage_daily(p_action text, p_limit integer)
RETURNS TABLE(new_count integer, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN QUERY SELECT * FROM public._usage_increment(v_user_id, p_action, p_limit);
END;
$$;

-- Dropped rather than replaced: adding p_amount with a default to the old
-- (text) signature would create an ambiguous overload.
DROP FUNCTION IF EXISTS public.record_usage_daily(text);
CREATE FUNCTION public.record_usage_daily(p_action text, p_amount integer DEFAULT 1)
RETURNS TABLE(new_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN QUERY SELECT * FROM public._usage_record(v_user_id, p_action, p_amount);
END;
$$;

-- Service-role wrappers, for Inngest functions and bearer-token API routes.
CREATE OR REPLACE FUNCTION public.increment_usage_daily_for(p_user_id uuid, p_action text, p_limit integer)
RETURNS TABLE(new_count integer, allowed boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT * FROM public._usage_increment(p_user_id, p_action, p_limit); $$;

CREATE OR REPLACE FUNCTION public.record_usage_daily_for(p_user_id uuid, p_action text, p_amount integer DEFAULT 1)
RETURNS TABLE(new_count integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT * FROM public._usage_record(p_user_id, p_action, p_amount); $$;

CREATE OR REPLACE FUNCTION public.set_my_timezone(p_timezone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tz text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  -- The trigger validates the name and applies the 24h throttle; what comes
  -- back is the timezone actually in effect, which may be the old one.
  UPDATE public.profiles SET timezone = p_timezone WHERE id = v_user_id RETURNING timezone INTO v_tz;
  RETURN v_tz;
END;
$$;

-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- and authenticated, so revoking from PUBLIC alone is not enough.
REVOKE ALL ON FUNCTION public.usage_local_day(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._usage_increment(uuid, text, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._usage_record(uuid, text, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_usage_daily_for(uuid, text, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_usage_daily_for(uuid, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.usage_local_day(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_usage_daily_for(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_usage_daily_for(uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.my_usage_window() FROM public, anon;
REVOKE ALL ON FUNCTION public.increment_usage_daily(text, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.record_usage_daily(text, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.set_my_timezone(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_usage_window() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_usage_daily(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_usage_daily(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_timezone(text) TO authenticated;

-- Rates for the actions metered from this migration on (lib/usage.ts's
-- TRACKED_ONLY_LABELS), plus job_evaluation, which was metered but never
-- priced. All run on the free-tier Gemini key. DO NOTHING so a hand-tuned rate
-- from /admin/expenses survives a replay.
INSERT INTO public.ai_cost_rates (action, rate_cents_per_call, provider) VALUES
  ('job_evaluation',        0, 'Gemini free tier'),
  ('search_job_scoring',    0, 'Gemini free tier (10 jobs per call)'),
  ('job_detail_extraction', 0, 'Gemini free tier'),
  ('weekly_briefing',       0, 'Gemini free tier'),
  ('resume_rescore',        0, 'Gemini free tier')
ON CONFLICT (action) DO NOTHING;
