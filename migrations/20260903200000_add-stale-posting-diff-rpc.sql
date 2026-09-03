-- Moves the crawl's "which postings disappeared from this board?" diff from
-- the application into Postgres. Two real problems, one fix.
--
-- 1. BANDWIDTH. This project's Supabase plan allows 5 GB of egress per
--    month. Doing the diff app-side meant every crawl run downloaded the
--    external_id of every currently-active posting for all ~200 companies in
--    the batch: measured at ~106 KB per run, and by far the largest egress
--    item in the whole crawl (the registry read is ~20 KB, and upserts echo
--    nothing back — verified, supabase-js v2 returns null unless .select()
--    is chained). Across three crawlers that is most of a gigabyte a month
--    spent shipping ids to the app purely so it could compare them and ship
--    a verdict back. Diffing in the database sends the current ids IN and
--    returns only a count, so per-run egress drops to roughly nothing.
--
-- 2. CORRECTNESS. Batching that read across companies quietly walked into
--    PostgREST's default 1000-row response cap — a live check returned
--    exactly 1000 rows, meaning companies past the cap silently lost their
--    stale-marking entirely. Per-company reads never hit it; the batched
--    version did. Set-based SQL has no such ceiling.
--
-- Takes the whole batch in one call: a JSONB array of
--   {platform, company_key, current_ids}
-- objects. Deactivation stays scoped to (ats_platform, company_key) exactly
-- as the application did it, so a posting id shared between two employers
-- can never deactivate the wrong company's row. Only rows currently active
-- are touched, and a company whose fetch failed is simply never included by
-- the caller — a failed fetch must never read as "this employer removed
-- every posting."
CREATE OR REPLACE FUNCTION public.mark_missing_postings_inactive(p_entries jsonb)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deactivated integer;
BEGIN
  WITH entries AS (
    SELECT
      entry->>'platform' AS ats_platform,
      entry->>'company_key' AS company_key,
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(entry->'current_ids')),
        ARRAY[]::text[]
      ) AS current_ids
    FROM jsonb_array_elements(p_entries) AS entry
  ),
  updated AS (
    UPDATE public.discovered_postings dp
    SET is_active = false
    FROM entries e
    WHERE dp.ats_platform = e.ats_platform
      AND dp.company_key = e.company_key
      AND dp.is_active
      AND NOT (dp.external_id = ANY (e.current_ids))
    RETURNING 1
  )
  SELECT count(*) INTO v_deactivated FROM updated;

  RETURN v_deactivated;
END;
$$;

-- Same posture as search_discovered_postings: discovered_postings has RLS on
-- with zero client policies and is only ever reached through the service-role
-- client (the crawl crons), so SECURITY INVOKER is correct here.
