-- Security fix, 2026-08-29 — real, verified bypass found during a proactive
-- audit (RLS policy review via `insforge db policies`). usage_daily and
-- rate_limit both let the row owner UPDATE their own row via RLS with no
-- WITH CHECK constraining the value. Since lib/usage.ts's
-- checkAndConsumeUsage() and lib/rateLimit.ts's checkRateLimit() write these
-- tables using the caller's own session client (not an admin client — this
-- is intentional, quota checks run inline in user-facing server actions),
-- any signed-in user could call the InsForge REST API directly with their
-- own real JWT and PATCH their `count` back to 0, resetting their daily
-- quota/rate-limit window on every metered AI action. Every action gated by
-- these tables triggers a real external cost (see lib/usage.ts's own
-- header comment) — this was a real cost/revenue exposure, not cosmetic.
--
-- Fix: move both tables' writes into SECURITY DEFINER functions that
-- resolve the caller from auth.uid() (never trusting a client-supplied user
-- id) and enforce the increment/limit server-side, then drop the raw
-- client-writable INSERT/UPDATE policies so direct table writes are
-- rejected outright. Both functions also make the check-then-increment
-- atomic (closing the read-then-write race lib/rateLimit.ts's own comment
-- already flagged as a known gap in the old two-step app-level flow).
--
-- RETURNS TABLE column names deliberately avoid `count` — PL/pgSQL auto-
-- declares RETURNS TABLE columns as in-scope variables for the whole
-- function body, so naming one `count` would shadow the real `count`
-- column in every INSERT/UPDATE/SELECT below and produce ambiguous or
-- wrong reads. `new_count` sidesteps that entirely.

CREATE OR REPLACE FUNCTION public.increment_usage_daily(p_action text, p_limit integer)
RETURNS TABLE(new_count integer, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT ud.count INTO v_count FROM public.usage_daily ud
    WHERE ud.user_id = v_user_id AND ud.day = v_today AND ud.action = p_action;

  IF v_count IS NOT NULL AND v_count >= p_limit THEN
    RETURN QUERY SELECT v_count, false;
    RETURN;
  END IF;

  INSERT INTO public.usage_daily (user_id, day, action, count)
  VALUES (v_user_id, v_today, p_action, 1)
  ON CONFLICT (user_id, day, action)
  DO UPDATE SET count = usage_daily.count + 1
  RETURNING count INTO v_count;

  RETURN QUERY SELECT v_count, true;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_usage_daily(text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.increment_usage_daily(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.bump_rate_limit(p_route text, p_window_seconds integer, p_max integer)
RETURNS TABLE(new_count integer, allowed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT rl.window_start, rl.count INTO v_window_start, v_count
    FROM public.rate_limit rl WHERE rl.user_id = v_user_id AND rl.route = p_route;

  IF v_window_start IS NULL OR v_now - v_window_start > (p_window_seconds || ' seconds')::interval THEN
    INSERT INTO public.rate_limit (user_id, route, window_start, count)
    VALUES (v_user_id, p_route, v_now, 1)
    ON CONFLICT (user_id, route)
    DO UPDATE SET window_start = v_now, count = 1
    RETURNING count INTO v_count;

    RETURN QUERY SELECT v_count, true;
    RETURN;
  END IF;

  IF v_count >= p_max THEN
    RETURN QUERY SELECT v_count, false;
    RETURN;
  END IF;

  UPDATE public.rate_limit SET count = count + 1
    WHERE user_id = v_user_id AND route = p_route
    RETURNING count INTO v_count;

  RETURN QUERY SELECT v_count, true;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_rate_limit(text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(text, integer, integer) TO authenticated;

-- Both tables keep their existing *_select_own policy (the app still reads
-- these directly for display/checks) — only the raw client-writable
-- INSERT/UPDATE policies are dropped, since all writes now go exclusively
-- through the SECURITY DEFINER functions above, which run as the table
-- owner and bypass RLS on their own writes.
DROP POLICY IF EXISTS usage_daily_insert_own ON public.usage_daily;
DROP POLICY IF EXISTS usage_daily_update_own ON public.usage_daily;
DROP POLICY IF EXISTS rate_limit_insert_own ON public.rate_limit;
DROP POLICY IF EXISTS rate_limit_update_own ON public.rate_limit;
