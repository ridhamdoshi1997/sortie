-- Phase 53 — a plan limit of 0 must actually block.
--
-- Found by testing the RPC directly rather than reading it: with p_limit = 0
-- and no existing row for today, the first call was ALLOWED.
--
--   limit=0, call 1 -> {"new_count":1,"allowed":true}    <- wrong
--   limit=0, call 2 -> {"new_count":1,"allowed":false}
--
-- Cause: the guard read `v_count IS NOT NULL AND v_count >= p_limit`. On the
-- day's first call v_count is NULL, so the guard could not fire and execution
-- fell through to the INSERT. Every non-zero limit hid this, because allowing
-- the first call is exactly right when the limit is 1 or more.
--
-- This matters now because the admin portal lets an owner set any plan's
-- per-action limit, and 0 is the natural way to express "this feature is not
-- included in this tier". Before this fix that silently granted one use per
-- day instead of none — a paid feature leaking into a free plan.
--
-- COALESCE(v_count, 0) makes the absent-row case behave identically to a
-- zero-count row, which is what it has always meant.

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

  -- COALESCE, not `IS NOT NULL AND` — see the header. A missing row is a
  -- count of zero, and at p_limit = 0 that must still block.
  IF COALESCE(v_count, 0) >= p_limit THEN
    RETURN QUERY SELECT COALESCE(v_count, 0), false;
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
