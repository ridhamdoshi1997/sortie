-- Match real-world job titles, not just O*NET's vocabulary.
--
-- The search matched `normalized_title = ANY(p_titles)`, where p_titles is a
-- list of O*NET LAY TITLES for the occupation. That makes any title O*NET does
-- not happen to list invisible, however obviously relevant it is. Measured for
-- "Investment Advisor" across the Toronto metro (2026-09-09):
--
--   investment advisor                                matched     13
--   investment advisor associate                      MISSED       3
--   wealth & investment advisor                       MISSED       1
--   investment advisor assistant                      MISSED       1
--   scotiamcleod lead investment advisor              MISSED       1
--   life and health insurance and investment advisor  MISSED       1
--
-- Those missed titles are precisely the ones a competitor returned for the same
-- search -- "Associate Wealth & Investment Advisor", "Investment Advisor
-- Assistant", "Senior Investment Advisor Associate". Our index HELD them; the
-- exact-match requirement hid them. 45 relevant postings existed and 13 were
-- shown.
--
-- p_contains_words adds a second way in: a posting also matches when its title
-- contains EVERY content word of the search. Precision is preserved because all
-- words are required -- "investment advisor" still will not match a plain
-- "financial advisor" -- while any arrangement of those words around them is
-- allowed, which is how employers actually write titles.
--
-- The taxonomy is not replaced. It still supplies genuine synonyms that share no
-- words at all ("wealth advisor" for "financial advisor"), which word matching
-- can never find. The two are complementary, so this ORs them.
--
-- DROPPED then recreated, deliberately. `CREATE OR REPLACE` with an added
-- parameter creates a NEW OVERLOAD rather than replacing anything, and PostgREST
-- cannot disambiguate overloads -- it returns PGRST203 and every search fails.
-- This project has been bitten by exactly that before; migration
-- 20260903180000 documents it and 20260907290000 cleaned up four stale
-- overloads left by the same mistake.
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer, text, text, text[], text, boolean);
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer, text, text, text[], text);
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer, text, text, text[]);
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer, text, text);
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer, text);
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer);
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[]);

CREATE FUNCTION public.search_postings_by_titles(
  p_titles         text[],
  p_limit          integer DEFAULT 300,
  p_location       text    DEFAULT NULL,
  p_exact_title    text    DEFAULT NULL,
  p_cities         text[]  DEFAULT NULL,
  p_primary_city   text    DEFAULT NULL,
  p_match_head     boolean DEFAULT false,
  p_contains_words text[]  DEFAULT NULL
)
RETURNS SETOF public.discovered_postings
LANGUAGE sql
STABLE
SET plan_cache_mode TO 'force_custom_plan'
AS $function$
  SELECT *
  FROM public.discovered_postings d
  WHERE d.is_active
    AND d.last_seen_at > now() - interval '21 days'
    AND (
      d.normalized_title = ANY(p_titles)
      OR (p_match_head AND d.normalized_title_head = ANY(p_titles))
      -- Every content word must be present, in any order and with anything
      -- around them. Matched against normalized_title so casing, punctuation
      -- and separators are already handled.
      OR (
        p_contains_words IS NOT NULL
        AND array_length(p_contains_words, 1) IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM unnest(p_contains_words) AS w
          WHERE d.normalized_title NOT LIKE '%' || w || '%'
        )
      )
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
    -- An exact-vocabulary hit still outranks a word match, so the canonical
    -- title leads and the long real-world variants follow it.
    (d.normalized_title = ANY(p_titles)) DESC,
    (d.ats_platform NOT IN ('linkedin', 'indeed')) DESC,
    d.last_seen_at DESC
  LIMIT p_limit
$function$;
