-- Match location against the whole metro area, not one city string.
--
-- Companion to 20260907230000. The search took a single city and did
-- ILIKE '%<city>%'; it now takes the expanded city list for that metro, so a
-- Toronto search reaches Mississauga, Markham, Scarborough and North York --
-- the 112 rows it was dropping for the financial-advisor occupation alone.
--
-- p_cities is the expansion (["toronto","north york",...]); p_primary_city is
-- what the candidate actually typed, kept separate so ranking can still put an
-- exact city match above the rest of the metro.
CREATE OR REPLACE FUNCTION public.search_postings_by_titles(
  p_titles text[],
  p_limit int DEFAULT 300,
  p_location text DEFAULT NULL,
  p_exact_title text DEFAULT NULL,
  p_cities text[] DEFAULT NULL,
  p_primary_city text DEFAULT NULL
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
      p_cities IS NULL
      OR array_length(p_cities, 1) IS NULL
      OR EXISTS (SELECT 1 FROM unnest(p_cities) AS city WHERE d.location ILIKE '%' || city || '%')
      OR d.location ~* '^(remote|anywhere)([[:space:]\-–,:]*(worldwide|global|anywhere))?$'
    )
  ORDER BY
    -- The typed city first, then the rest of the metro, then remote.
    (p_primary_city IS NOT NULL AND d.location ILIKE '%' || p_primary_city || '%') DESC,
    (p_cities IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p_cities) AS city WHERE d.location ILIKE '%' || city || '%')) DESC,
    (p_exact_title IS NOT NULL AND d.normalized_title = p_exact_title) DESC,
    (d.ats_platform NOT IN ('linkedin', 'indeed')) DESC,
    d.last_seen_at DESC
  LIMIT p_limit
$$;

ALTER FUNCTION public.search_postings_by_titles(text[], int, text, text, text[], text)
  SET plan_cache_mode = force_custom_plan;
