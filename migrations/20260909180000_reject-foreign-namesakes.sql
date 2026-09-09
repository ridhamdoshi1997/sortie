-- Reject cities that merely SHARE A NAME with one in the searched metro.
--
-- The city test is a substring match, so it cannot tell which country a city is
-- in. Toronto's metro contains Hamilton, Aurora and Burlington -- and so does
-- the United States. Live results for a Toronto search included:
--
--   US-NJ-Hamilton                    "Alternative Investments Analyst"
--   Aurora East, IL, United States    "Bilingual Financial Services Rep"
--   Burlington, NC, us                "Financial Analyst"
--
-- All three are unreachable for a Toronto candidate, and they are exactly the
-- kind of obviously-wrong result that costs trust faster than a missing one.
--
-- The rule is a VETO, not a filter: a location naming a different country is
-- rejected UNLESS it also names this one. That last part matters -- genuinely
-- multi-site postings like "CA-ON-Toronto | US" and "Canada (Remote); Toronto,
-- Canada (Hybrid); United States (Remote)" are real Toronto roles and must
-- survive. Both name Canada, so both do.
--
-- Signature unchanged, so no new overload is possible.
CREATE OR REPLACE FUNCTION public.search_postings_by_titles(
  p_titles         text[],
  p_limit          integer DEFAULT 300,
  p_location       text    DEFAULT NULL,
  p_exact_title    text    DEFAULT NULL,
  p_cities         text[]  DEFAULT NULL,
  p_primary_city   text    DEFAULT NULL,
  p_match_head     boolean DEFAULT false,
  p_search_text    text    DEFAULT NULL,
  p_country        text    DEFAULT NULL,
  -- Two-letter code for the searched country, e.g. 'CA'. Used only to spot the
  -- "CA-ON-Toronto" style prefix as a domestic marker.
  p_country_code   text    DEFAULT NULL
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
      OR d.location ~* '^[[:space:]]*((fully|100%)[[:space:]]*)?remote([[:space:]\-–,:()]*(job|jobs|position|role|work|opportunity|worldwide|world[[:space:]]?wide|global|anywhere))?[[:space:]()]*$'
      OR d.location ~* '^[[:space:]]*(worldwide|world[[:space:]]?wide|global|anywhere)[[:space:]\-–,:()]*remote[[:space:]()]*$'
      OR (
        p_country IS NOT NULL
        AND d.location ~* ('^([[:space:]]*remote[[:space:]\-–,:()]*)?' || p_country || '([[:space:]\-–,:()]*remote)?[[:space:]()]*$')
      )
    )
    -- Foreign-namesake veto. Only applies when the country is known, and only
    -- bites when the location names another country and NOT this one.
    AND (
      p_country IS NULL
      -- \m is START of word and \M is END of word in Postgres. An earlier
      -- version used \m for both, so "\mus\m" never matched "US-NJ-Hamilton"
      -- or a trailing ", us" and the veto silently did nothing for exactly the
      -- cases it was written for.
      OR d.location !~* '(united states|u\.s\.a?\.?|\m(usa|us|india|uk)\M|united kingdom|australia|deutschland|germany)'
      OR d.location ~* p_country
      OR (p_country_code IS NOT NULL AND d.location ~* ('\m' || p_country_code || '[-,[:space:]]'))
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
