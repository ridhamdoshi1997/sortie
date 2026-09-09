-- Show remote roles that are genuinely open to this candidate's country.
--
-- "Remote" does not reliably mean "anywhere" -- most remote postings are
-- restricted by work authorisation, and the location string is where that shows
-- up. Counted in the live index:
--
--   Remote (United States)  1296     Remote - US        918
--   Remote - USA             760     US Remote          462
--   India (Remote)           178     Remote - India      72
--
-- None of those are available to someone searching Toronto, so a blanket "show
-- every remote job" would fill a Canadian search with roles they cannot legally
-- take. The rule is therefore remote AND not restricted to a different country.
--
-- The previous pattern was too strict in the other direction and silently
-- dropped genuinely-anywhere roles on pure formatting:
--
--   Remote job          527     -- a word it did not allow
--   World Wide - Remote 198     -- qualifier before "remote" instead of after
--   "Remote "           150     -- a trailing space
--
-- Verified against the 30 most common remote locations in the index before
-- being applied: 6,441 genuinely-anywhere rows now match and ZERO
-- country-restricted ones do. Country-specific remote ("Remote - Canada",
-- "Remote (Canada)") is handled by the separate p_country clause, which is what
-- keeps this one free to be country-agnostic.
--
-- Signature unchanged, so CREATE OR REPLACE is safe here -- no new overload can
-- be created, which is the trap documented in 20260903180000.
CREATE OR REPLACE FUNCTION public.search_postings_by_titles(
  p_titles         text[],
  p_limit          integer DEFAULT 300,
  p_location       text    DEFAULT NULL,
  p_exact_title    text    DEFAULT NULL,
  p_cities         text[]  DEFAULT NULL,
  p_primary_city   text    DEFAULT NULL,
  p_match_head     boolean DEFAULT false,
  p_search_text    text    DEFAULT NULL,
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
      -- Remote with no country attached, in either word order, tolerating the
      -- filler words and stray whitespace employers actually write.
      OR d.location ~* '^[[:space:]]*((fully|100%)[[:space:]]*)?remote([[:space:]\-–,:()]*(job|jobs|position|role|work|opportunity|worldwide|world[[:space:]]?wide|global|anywhere))?[[:space:]()]*$'
      OR d.location ~* '^[[:space:]]*(worldwide|world[[:space:]]?wide|global|anywhere)[[:space:]\-–,:()]*remote[[:space:]()]*$'
      -- Remote or head-office within THIS country: "Canada", "Canada (Remote)",
      -- "Remote - Canada". Anchored, so "Vancouver, Canada" stays out.
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
