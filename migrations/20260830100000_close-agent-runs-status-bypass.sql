-- Security fix, 2026-08-30 — same shape as the 2026-08-29 usage_daily/
-- rate_limit quota-bypass fix, lower stakes here (status-spoofing, not a
-- cost bypass). agent_runs lets the row owner UPDATE via RLS with no
-- WITH CHECK on the value — a signed-in user could PATCH their own run's
-- status/error_message/jobs_found directly via the REST API, independent
-- of what the real scrape/evaluation pipeline actually did.
--
-- Fix: a SECURITY DEFINER RPC that resolves the caller from auth.uid()
-- (never a client-supplied user id) and updates only the caller's own row,
-- then drop the raw client-writable UPDATE policy. INSERT stays as-is —
-- a self-authored row with only the benign initial fields
-- (status='running', jobs_found=0) grants no extra resource, unlike the
-- UPDATE path this closes.
--
-- One flexible RPC covers all 4 real update shapes in
-- lib/actions/scraper.actions.ts (fail-on-scrape-error, empty-results-
-- completed, fail-on-upsert-error, jobs_found-count-only) via
-- NULL-means-"don't touch" COALESCE — passing only the fields that
-- actually changed at each call site.
CREATE OR REPLACE FUNCTION public.update_agent_run(
  p_run_id uuid,
  p_status text DEFAULT NULL,
  p_is_successful boolean DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_jobs_found integer DEFAULT NULL
)
RETURNS void
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

  UPDATE public.agent_runs
  SET
    status = COALESCE(p_status, status),
    is_successful = COALESCE(p_is_successful, is_successful),
    error_message = COALESCE(p_error_message, error_message),
    jobs_found = COALESCE(p_jobs_found, jobs_found),
    updated_at = now()
  WHERE id = p_run_id AND user_id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_agent_run(uuid, text, boolean, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.update_agent_run(uuid, text, boolean, text, integer) TO authenticated;

DROP POLICY IF EXISTS agent_runs_update_own ON public.agent_runs;
