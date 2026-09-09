-- Rank by title closeness, cheaply enough to survive the statement timeout.
--
-- 20260909130000 got the SEMANTICS right and the COST wrong: it expressed the
-- "title contains every searched word" test as a correlated
-- NOT EXISTS (SELECT 1 FROM unnest(...)) evaluated per row, in both the WHERE
-- and the ORDER BY. On a 600k-row table that is a subquery per candidate row,
-- and the search stopped returning anything at all -- "Software Engineer" went
-- from 279 results to 0, killed by 57014 rather than by any matching rule.
--
-- Same test, expressed as `normalized_title LIKE ALL (patterns)`: one scalar
-- array operation the planner can evaluate inline. The caller passes patterns
-- already wrapped as %word%, so no per-row string building happens here either.
--
-- The behaviour this supports (two live user reports pulling opposite ways):
--   "Investment Advisor" must not be dominated by Financial Advisor roles --
--     the occupation is wider than the words.
--   "Software Developer" must still reach Software Engineer roles -- the words
--     are narrower than the job, and the taxonomy is what knows they are the
--     same.
-- Filtering satisfies one and breaks the other, so recall stays wide and the
-- ORDER BY decides what leads.
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer, text, text, text[], text, boolean, text[]);

CREATE FUNCTION public.search_postings_by_titles(
  p_titles            text[],
  p_limit             integer DEFAULT 300,
  p_location          text    DEFAULT NULL,
  p_exact_title       text    DEFAULT NULL,
  p_cities            text[]  DEFAULT NULL,
  p_primary_city      text    DEFAULT NULL,
  p_match_head        boolean DEFAULT false,
  -- Already wrapped as %word% by the caller.
  p_word_patterns     text[]  DEFAULT NULL
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
      -- Reaches the titles O*NET has never heard of: "investment advisor
      -- associate", "wealth & investment advisor", "investment advisor
      -- assistant". All real, all relevant, none in the taxonomy -- 45 such
      -- postings existed for Investment Advisor in Toronto and 13 were shown.
      OR (p_word_patterns IS NOT NULL AND d.normalized_title LIKE ALL (p_word_patterns))
    )
    AND (
      p_cities IS NULL
      OR array_length(p_cities, 1) IS NULL
      OR EXISTS (SELECT 1 FROM unnest(p_cities) AS city WHERE d.location ILIKE '%' || city || '%')
      OR d.location ~* '^(remote|anywhere)([[:space:]\-–,:]*(worldwide|global|anywhere))?$'
    )
  ORDER BY
    (p_primary_city IS NOT NULL AND d.location ILIKE '%' || p_primary_city || '%') DESC,
    (p_exact_title IS NOT NULL AND d.normalized_title = p_exact_title) DESC,
    -- The line that fixes "Investment Advisor" without narrowing "Software
    -- Developer": titles carrying every searched word lead, the wider
    -- occupation follows underneath rather than being cut off.
    (p_word_patterns IS NOT NULL AND d.normalized_title LIKE ALL (p_word_patterns)) DESC,
    (d.normalized_title = ANY(p_titles)) DESC,
    (d.ats_platform NOT IN ('linkedin', 'indeed')) DESC,
    d.last_seen_at DESC
  LIMIT p_limit
$function$;
