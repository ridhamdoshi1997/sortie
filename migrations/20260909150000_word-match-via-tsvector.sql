-- Do the "title contains every searched word" test through the EXISTING
-- full-text index instead of LIKE.
--
-- 20260909140000 fixed the correctness but not the cost: `normalized_title LIKE
-- ALL ('%software%','%engineer%')` cannot use any index -- a leading wildcard
-- forces a sequential scan of every row. Measured at 10-16 seconds per search
-- on 600k rows, which is over PostgREST's 8s statement timeout, so it would
-- have failed in production exactly the way the previous version did.
--
-- discovered_postings_title_tsv_idx is a GIN index on title_tsv that has
-- existed all along. plainto_tsquery ANDs its terms by default, so
-- plainto_tsquery('english', 'software engineer') is 'softwar' & 'engin' --
-- precisely the every-word test, answered from the index. It also stems, so
-- advisor/advisers and engineer/engineering agree without a word list, and it
-- takes the raw search string safely (no quoting or injection surface, unlike
-- building a tsquery by concatenation).
--
-- Same behaviour as before, two orders of magnitude cheaper:
--   "Investment Advisor" is not drowned by Financial Advisor roles.
--   "Software Developer" still reaches Software Engineer roles via the
--   taxonomy, which stays in the WHERE and sorts underneath.
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], integer, text, text, text[], text, boolean, text[]);

CREATE FUNCTION public.search_postings_by_titles(
  p_titles         text[],
  p_limit          integer DEFAULT 300,
  p_location       text    DEFAULT NULL,
  p_exact_title    text    DEFAULT NULL,
  p_cities         text[]  DEFAULT NULL,
  p_primary_city   text    DEFAULT NULL,
  p_match_head     boolean DEFAULT false,
  -- The raw search title. Turned into an AND-ed tsquery here.
  p_search_text    text    DEFAULT NULL
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
      -- Reaches titles O*NET has never heard of -- "investment advisor
      -- associate", "wealth & investment advisor", "investment advisor
      -- assistant" -- which are real, relevant, and were all invisible.
      OR (q.tsq IS NOT NULL AND d.title_tsv @@ q.tsq)
    )
    AND (
      p_cities IS NULL
      OR array_length(p_cities, 1) IS NULL
      OR EXISTS (SELECT 1 FROM unnest(p_cities) AS city WHERE d.location ILIKE '%' || city || '%')
      OR d.location ~* '^(remote|anywhere)([[:space:]\-–,:]*(worldwide|global|anywhere))?$'
    )
  ORDER BY
    (p_exact_title IS NOT NULL AND d.normalized_title = p_exact_title) DESC,
    -- Every searched word present beats the wider occupation. This is what
    -- keeps Investment Advisor from being led by Financial Advisor roles,
    -- while the occupation still supplies Software Engineer for a Software
    -- Developer search rather than being cut off.
    (q.tsq IS NOT NULL AND d.title_tsv @@ q.tsq) DESC,
    (p_primary_city IS NOT NULL AND d.location ILIKE '%' || p_primary_city || '%') DESC,
    (d.normalized_title = ANY(p_titles)) DESC,
    (d.ats_platform NOT IN ('linkedin', 'indeed')) DESC,
    d.last_seen_at DESC
  LIMIT p_limit
$function$;
