-- Rank by how well a title matches, instead of filtering on it.
--
-- Two live reports pull in opposite directions and no filter satisfies both:
--
--   "Investment Advisor" returned mostly Financial Advisor roles -- the
--   occupation was too WIDE. O*NET files both under "Personal Financial
--   Advisors", and only 9 of that occupation's 50 lay titles mention
--   investment.
--
--   "Software Developer" returned 44 while "Software Engineer" returned 279 --
--   requiring the literal word made it too NARROW. Those are the same job, and
--   the taxonomy is exactly what knows it.
--
-- Filtering to focused titles fixes the first and causes the second. Filtering
-- to the occupation does the reverse. So this stops choosing: the WHERE clause
-- keeps full recall -- taxonomy synonyms plus any title containing every word
-- searched -- and the ORDER BY puts the closest matches first.
--
-- A candidate searching "Investment Advisor" therefore sees investment-advisor
-- roles at the top with the wider occupation beneath, rather than 37 financial
-- advisors before the first investment one. A candidate searching "Software
-- Developer" still sees all 279 software engineering roles. Both get what they
-- asked for, and the client sorts by match score on top of this.
--
-- DROP then CREATE, not CREATE OR REPLACE: the signature changes, and an added
-- parameter would create a second OVERLOAD that PostgREST cannot disambiguate
-- (PGRST203, every search fails). Documented in 20260903180000, and cleaned up
-- once already in 20260907290000.
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer, text, text, text[], text, boolean, text[]);
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer, text, text, text[], text, boolean);

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
      -- Reaches titles O*NET has never heard of: "investment advisor
      -- associate", "wealth & investment advisor", "scotiamcleod lead
      -- investment advisor". All real, all relevant, none in the taxonomy.
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
    -- Location first: a perfect title in the wrong city helps nobody.
    (p_primary_city IS NOT NULL AND d.location ILIKE '%' || p_primary_city || '%') DESC,
    (p_cities IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(p_cities) AS city WHERE d.location ILIKE '%' || city || '%')) DESC,
    -- Then title closeness, most literal first. This is the line that fixes the
    -- Investment Advisor complaint without narrowing Software Developer: the
    -- occupation still comes back, it just sorts underneath.
    (p_exact_title IS NOT NULL AND d.normalized_title = p_exact_title) DESC,
    (
      p_contains_words IS NOT NULL
      AND array_length(p_contains_words, 1) IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_contains_words) AS w
        WHERE d.normalized_title NOT LIKE '%' || w || '%'
      )
    ) DESC,
    (d.normalized_title = ANY(p_titles)) DESC,
    (d.ats_platform NOT IN ('linkedin', 'indeed')) DESC,
    d.last_seen_at DESC
  LIMIT p_limit
$function$;
