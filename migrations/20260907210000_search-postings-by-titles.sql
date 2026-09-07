-- Search the index by a list of equivalent titles.
--
-- Replaces the JOIN version in 20260907200000, which was correct but slow: 7040ms
-- against an 8s PostgREST statement timeout. Passing the expanded title list in
-- lets Postgres use discovered_postings_normalized_title_idx directly -- the same
-- 102 rows come back in ~110ms warm.
--
-- The caller expands "Financial Advisor" into the 146 lay titles O*NET files
-- under the same occupations. That expansion is two cheap indexed queries
-- against occupation_titles and is what makes the index reachable by occupation
-- at all: matching title WORDS meant Financial Planner and Investment Advisor
-- rows were never returned for the relevance filter to consider.
DROP FUNCTION IF EXISTS public.search_postings_by_occupation(text[], int, text);

CREATE OR REPLACE FUNCTION public.search_postings_by_titles(
  p_titles text[],
  p_limit int DEFAULT 300,
  p_location text DEFAULT NULL
)
RETURNS SETOF public.discovered_postings
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.discovered_postings d
  WHERE d.is_active
    AND d.last_seen_at > now() - interval '21 days'
    AND d.normalized_title = ANY(p_titles)
    AND (
      btrim(split_part(coalesce(p_location, ''), ',', 1)) = ''
      OR d.location ILIKE '%' || btrim(split_part(coalesce(p_location, ''), ',', 1)) || '%'
      OR d.location ~* '^(remote|anywhere)([[:space:]\-–,:]*(worldwide|global|anywhere))?$'
    )
  -- Real city matches before remote ones, newest first within each, matching
  -- search_discovered_postings' own tiering.
  ORDER BY
    (btrim(split_part(coalesce(p_location, ''), ',', 1)) <> ''
     AND d.location ILIKE '%' || btrim(split_part(coalesce(p_location, ''), ',', 1)) || '%') DESC,
    d.last_seen_at DESC
  LIMIT p_limit
$$;

ALTER FUNCTION public.search_postings_by_titles(text[], int, text)
  SET plan_cache_mode = force_custom_plan;
