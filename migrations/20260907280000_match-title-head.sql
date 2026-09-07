-- Use the stored title head in the search.
--
-- Companion to 20260907270000. Postings whose title carries a trailing
-- qualifier -- "Financial Advisor CIRO", "Investment Advisor Associate",
-- "Financial Advisor Assistant" -- were not matching their own occupation,
-- because normalisation strips leading words but not trailing ones. 15 such
-- rows for Toronto financial advisors alone.
--
-- p_match_head is opt-in so the behaviour can be turned off without a redeploy
-- if it ever proves too loose for some occupation.
CREATE OR REPLACE FUNCTION public.search_postings_by_titles(
  p_titles text[],
  p_limit int DEFAULT 300,
  p_location text DEFAULT NULL,
  p_exact_title text DEFAULT NULL,
  p_cities text[] DEFAULT NULL,
  p_primary_city text DEFAULT NULL,
  p_match_head boolean DEFAULT false
)
RETURNS SETOF public.discovered_postings
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.discovered_postings d
  WHERE d.is_active
    AND d.last_seen_at > now() - interval '21 days'
    AND (
      d.normalized_title = ANY(p_titles)
      OR (p_match_head AND d.normalized_title_head = ANY(p_titles))
    )
    AND (
      p_cities IS NULL
      OR array_length(p_cities, 1) IS NULL
      OR EXISTS (SELECT 1 FROM unnest(p_cities) AS city WHERE d.location ILIKE '%' || city || '%')
      OR d.location ~* '^(remote|anywhere)([[:space:]\-–,:]*(worldwide|global|anywhere))?$'
    )
  ORDER BY
    (p_primary_city IS NOT NULL AND d.location ILIKE '%' || p_primary_city || '%') DESC,
    (p_cities IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p_cities) AS city WHERE d.location ILIKE '%' || city || '%')) DESC,
    (p_exact_title IS NOT NULL AND d.normalized_title = p_exact_title) DESC,
    (d.ats_platform NOT IN ('linkedin', 'indeed')) DESC,
    d.last_seen_at DESC
  LIMIT p_limit
$$;

ALTER FUNCTION public.search_postings_by_titles(text[], int, text, text, text[], text, boolean)
  SET plan_cache_mode = force_custom_plan;
