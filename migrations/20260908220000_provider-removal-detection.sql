-- Removal detection for LinkedIn and Indeed postings.
--
-- ATS postings already have this: the crawl fetches a company's WHOLE board, so
-- anything absent from that fetch is genuinely gone, and
-- mark_missing_postings_inactive retires it. Provider postings never had it,
-- because a search returns one query's results and never a complete listing --
-- absence proved nothing, so the only cleanup was a 21-day timer. A LinkedIn job
-- could sit in the index for three weeks after it closed and a candidate found
-- out by clicking through to a dead page.
--
-- The 24h demand-driven refresh (20260908210000) changes what is knowable. Re-
-- running the SAME query gives an enumerable set, exactly like a company's
-- board: postings that were in that query's results before and are missing now
-- are very likely closed.
--
-- TWO-STRIKE, not one. A posting can drop out of a query's top-N for reasons
-- other than closing -- ranking shifts, or enough new postings pushing it past
-- the cap -- so a single absence is not proof. Same rule the legitimacy check
-- already uses (20260903120000), for the same reason: one signal is evidence,
-- two consecutive ones are a decision.

CREATE TABLE IF NOT EXISTS public.provider_query_postings (
  query_key    text        NOT NULL,
  platform     text        NOT NULL,
  external_id  text        NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  miss_count   int         NOT NULL DEFAULT 0,
  PRIMARY KEY (query_key, platform, external_id)
);

COMMENT ON TABLE public.provider_query_postings IS
  'Which provider postings each search query returned last time, so a posting that stops appearing can be retired after two consecutive misses.';

CREATE INDEX IF NOT EXISTS provider_query_postings_lookup_idx
  ON public.provider_query_postings (platform, external_id);

-- Reconciles one query's results against the previous run.
--   * ids present now      -> recorded, miss_count reset to 0
--   * ids absent this time -> miss_count + 1
--   * miss_count >= 2      -> the posting is retired (is_active = false)
--
-- Retiring sets is_active rather than deleting, so the row still de-duplicates
-- future crawls and the existing prune owns actual deletion. Scoped strictly to
-- this query's own platform rows: a posting this query never returned must never
-- be retired by this query's absence.
CREATE OR REPLACE FUNCTION public.reconcile_provider_query(
  p_query_key   text,
  p_platform    text,
  p_current_ids text[]
)
RETURNS TABLE (seen int, missed int, retired int)
LANGUAGE plpgsql
AS $$
DECLARE
  v_seen    int := 0;
  v_missed  int := 0;
  v_retired int := 0;
BEGIN
  IF p_query_key IS NULL OR p_platform IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  -- An empty result set is NOT evidence that every job closed. It is far more
  -- likely the actor failed, was rate limited, or ran out of credit. Treating it
  -- as proof would retire a query's entire inventory on one bad run.
  IF p_current_ids IS NULL OR array_length(p_current_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  INSERT INTO public.provider_query_postings AS q (query_key, platform, external_id, last_seen_at, miss_count)
  SELECT p_query_key, p_platform, id, now(), 0
  FROM unnest(p_current_ids) AS id
  ON CONFLICT (query_key, platform, external_id) DO UPDATE
    SET last_seen_at = now(), miss_count = 0;
  GET DIAGNOSTICS v_seen = ROW_COUNT;

  UPDATE public.provider_query_postings q
     SET miss_count = q.miss_count + 1
   WHERE q.query_key = p_query_key
     AND q.platform  = p_platform
     AND NOT (q.external_id = ANY (p_current_ids));
  GET DIAGNOSTICS v_missed = ROW_COUNT;

  WITH doomed AS (
    SELECT q.external_id
    FROM public.provider_query_postings q
    WHERE q.query_key = p_query_key
      AND q.platform  = p_platform
      AND q.miss_count >= 2
  )
  UPDATE public.discovered_postings d
     SET is_active = false
    FROM doomed
   WHERE d.ats_platform = p_platform
     AND d.external_id  = doomed.external_id
     AND d.is_active;
  GET DIAGNOSTICS v_retired = ROW_COUNT;

  -- Retired rows stop being tracked: the posting is settled, and leaving them
  -- would grow this table without bound.
  DELETE FROM public.provider_query_postings q
   WHERE q.query_key = p_query_key
     AND q.platform  = p_platform
     AND q.miss_count >= 2;

  RETURN QUERY SELECT v_seen, v_missed, v_retired;
END;
$$;
