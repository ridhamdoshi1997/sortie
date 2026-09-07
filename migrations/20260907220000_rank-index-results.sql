-- Add the ranking stage the pipeline was missing.
--
-- Every platform researched runs retrieve -> rank -> personalise. This index
-- retrieved and filtered but never RANKED: results came back ordered by
-- last_seen_at, so a search returning 225 Software Engineer jobs showed the most
-- recently crawled rather than the best match. Recency is a tiebreaker, not a
-- relevance signal.
--
-- Ranking here is deliberately explainable rather than learned. A
-- learning-to-rank model needs click data this product does not have yet, and
-- the ordering below is the same shape those models start from:
--
--   1. City match      -- a Toronto job beats a remote one for a Toronto search
--   2. Exact title     -- "Financial Advisor" beats "Wealth Advisor" when that
--                         is what was typed, even though both are the same
--                         occupation and both belong in the results
--   3. Direct employer -- an ATS board row beats a LinkedIn/Indeed row for the
--                         same job: it is a real employer link, and the crawl
--                         re-verifies it every 15 minutes
--   4. Recency         -- last, as a tiebreaker
--
-- p_exact_title is the caller's normalised search title, so step 2 costs a
-- string comparison against a column that is already indexed and already
-- normalised the same way.
CREATE OR REPLACE FUNCTION public.search_postings_by_titles(
  p_titles text[],
  p_limit int DEFAULT 300,
  p_location text DEFAULT NULL,
  p_exact_title text DEFAULT NULL
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
  ORDER BY
    (btrim(split_part(coalesce(p_location, ''), ',', 1)) <> ''
     AND d.location ILIKE '%' || btrim(split_part(coalesce(p_location, ''), ',', 1)) || '%') DESC,
    (p_exact_title IS NOT NULL AND d.normalized_title = p_exact_title) DESC,
    (d.ats_platform NOT IN ('linkedin', 'indeed')) DESC,
    d.last_seen_at DESC
  LIMIT p_limit
$$;

ALTER FUNCTION public.search_postings_by_titles(text[], int, text, text)
  SET plan_cache_mode = force_custom_plan;
