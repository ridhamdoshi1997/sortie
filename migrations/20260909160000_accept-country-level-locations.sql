-- Accept postings located at the COUNTRY, not only at a city or region.
--
-- The location test matched metro city names, spelled-out province names, or a
-- location that is literally "Remote". A posting whose employer wrote "Canada",
-- "Canada (Remote)" or "Remote - Canada" matched none of those and was dropped,
-- even though it is open to someone in Toronto. Reported from a competitor
-- showing two such roles -- "Finance & Investment Analyst Intern" and "Finance
-- & Investment Analyst (Remote)", both listed as Canada / Remote.
--
-- Deliberately an ANCHORED match on the country alone, never ILIKE '%canada%'.
-- A substring test would also match "Vancouver, Canada" and "Montreal, Canada",
-- turning a Toronto search into a nationwide one -- the opposite of the
-- precision work that preceded this. The pattern accepts the country by itself,
-- optionally wrapped in a remote marker, and nothing else.
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer, text, text, text[], text, boolean, text);

CREATE FUNCTION public.search_postings_by_titles(
  p_titles         text[],
  p_limit          integer DEFAULT 300,
  p_location       text    DEFAULT NULL,
  p_exact_title    text    DEFAULT NULL,
  p_cities         text[]  DEFAULT NULL,
  p_primary_city   text    DEFAULT NULL,
  p_match_head     boolean DEFAULT false,
  p_search_text    text    DEFAULT NULL,
  -- Country name for the search, e.g. 'canada'. Matched only as the WHOLE
  -- location, so it cannot widen a city search into a national one.
  p_country        text    DEFAULT NULL
)
RETURNS SETOF public.discovered_postings
LANGUAGE sql
STABLE
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  WITH q AS (
    SELECT CASE
             WHEN p_search_text IS NULL OR btrim(p_search_text) = '' THEN NULL
             ELSE plainto_tsquery('english', p_search_text)
           END AS tsq
  )
  SELECT d.*
  FROM public.discovered_postings d, q
  WHERE d.is_active
    AND d.last_seen_at > now() - interval '21 days'
    AND (
      d.normalized_title = ANY(p_titles)
      OR (p_match_head AND d.normalized_title_head = ANY(p_titles))
      OR (q.tsq IS NOT NULL AND d.title_tsv @@ q.tsq)
    )
    AND (
      p_cities IS NULL
      OR array_length(p_cities, 1) IS NULL
      OR EXISTS (SELECT 1 FROM unnest(p_cities) AS city WHERE d.location ILIKE '%' || city || '%')
      OR d.location ~* '^(remote|anywhere)([[:space:]\-–,:]*(worldwide|global|anywhere))?$'
      -- Country-only, anchored: "Canada", "Canada (Remote)", "Remote - Canada".
      -- NOT "Vancouver, Canada".
      OR (
        p_country IS NOT NULL
        AND d.location ~* ('^([[:space:]]*remote[[:space:]\-–,:()]*)?' || p_country || '([[:space:]\-–,:()]*remote)?[[:space:]()]*$')
      )
    )
  ORDER BY
    (p_exact_title IS NOT NULL AND d.normalized_title = p_exact_title) DESC,
    (q.tsq IS NOT NULL AND d.title_tsv @@ q.tsq) DESC,
    (p_primary_city IS NOT NULL AND d.location ILIKE '%' || p_primary_city || '%') DESC,
    (d.normalized_title = ANY(p_titles)) DESC,
    (d.ats_platform NOT IN ('linkedin', 'indeed')) DESC,
    d.last_seen_at DESC
  LIMIT p_limit
$function$;
