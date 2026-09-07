-- Recency cutoff on the index search.
--
-- The search filtered on is_active alone, which was safe while every row came
-- from the ATS crawl: that crawl re-polls each employer's own board every 15
-- minutes and marks anything that stops appearing, so is_active WAS a liveness
-- heartbeat. Measured before this change: all 451,417 active postings had been
-- seen within 2 days, none older than 7.
--
-- LinkedIn and Indeed rows now enter the same table (storeProviderJobsInIndex),
-- and nothing re-polls those for free -- a refresh costs a paid actor run. They
-- are only as fresh as the last search that happened to find them, so without a
-- cutoff they would sit in the index indefinitely and become exactly the ghost
-- jobs this product exists not to show.
--
-- 21 days is well beyond the crawl's own 15-minute cycle, so it never excludes a
-- crawled row that is genuinely live; it only expires rows nothing is
-- refreshing. A stale row is not deleted here -- the eviction cron owns
-- deletion -- it simply stops being served.
DROP FUNCTION IF EXISTS public.search_discovered_postings(text, int, text);

CREATE FUNCTION public.search_discovered_postings(
  p_query text,
  p_limit int DEFAULT 30,
  p_location text DEFAULT NULL
)
RETURNS SETOF public.discovered_postings
LANGUAGE sql
STABLE
AS $$
  SELECT (s.rec).*
  FROM (
    (SELECT d AS rec, 0 AS tier, d.last_seen_at AS seen
       FROM public.discovered_postings d
      WHERE d.is_active
        AND d.last_seen_at > now() - interval '21 days'
        AND d.title_tsv @@ websearch_to_tsquery('english', p_query)
        AND (
          btrim(split_part(coalesce(p_location, ''), ',', 1)) = ''
          OR d.location ILIKE '%' || btrim(split_part(coalesce(p_location, ''), ',', 1)) || '%'
        )
      ORDER BY d.last_seen_at DESC
      LIMIT p_limit)

    UNION ALL

    (SELECT d AS rec, 1 AS tier, d.last_seen_at AS seen
       FROM public.discovered_postings d
      WHERE d.is_active
        AND d.last_seen_at > now() - interval '21 days'
        AND d.title_tsv @@ websearch_to_tsquery('english', p_query)
        AND btrim(split_part(coalesce(p_location, ''), ',', 1)) <> ''
        AND d.location ~* '^(remote|anywhere)([[:space:]\-–,:]*(worldwide|global|anywhere))?$'
      ORDER BY d.last_seen_at DESC
      LIMIT p_limit)
  ) s
  ORDER BY s.tier, s.seen DESC
  LIMIT p_limit
$$;

-- Without this the generic plan PostgREST caches is up to 90x slower and blows
-- the 8s statement timeout. See 20260904220000 for the measurements. A DROP
-- discards the setting, so it must be re-applied here.
ALTER FUNCTION public.search_discovered_postings(text, int, text)
  SET plan_cache_mode = force_custom_plan;
