-- Search the index by occupation.
--
-- Companion to 20260907190000. search_discovered_postings matches title WORDS,
-- so it can only return rows whose titles contain the searched words -- the
-- O*NET filter then narrows that set and can never widen it. This joins the
-- postings to the taxonomy instead, so a "Financial Advisor" search reaches
-- every Financial Planner, Investment Advisor and Wealth Advisor row directly.
--
-- DISTINCT ON the natural key because a normalized title can belong to more than
-- one occupation (6,178 of 44,779 do), which would otherwise return a row once
-- per matching group.
--
-- Location and tiering match search_discovered_postings exactly, so the two
-- behave the same in every respect except how titles are selected.
CREATE OR REPLACE FUNCTION public.search_postings_by_occupation(
  p_soc_groups text[],
  p_limit int DEFAULT 300,
  p_location text DEFAULT NULL
)
RETURNS SETOF public.discovered_postings
LANGUAGE sql
STABLE
AS $$
  SELECT (s.rec).*
  FROM (
    SELECT DISTINCT ON (d.ats_platform, d.company_key, d.external_id)
           d AS rec,
           CASE WHEN btrim(split_part(coalesce(p_location, ''), ',', 1)) = '' THEN 0
                WHEN d.location ILIKE '%' || btrim(split_part(coalesce(p_location, ''), ',', 1)) || '%' THEN 0
                ELSE 1 END AS tier,
           d.last_seen_at AS seen
    FROM public.discovered_postings d
    JOIN public.occupation_titles ot ON ot.title = d.normalized_title
    WHERE d.is_active
      AND d.last_seen_at > now() - interval '21 days'
      AND ot.soc_group = ANY(p_soc_groups)
      AND (
        btrim(split_part(coalesce(p_location, ''), ',', 1)) = ''
        OR d.location ILIKE '%' || btrim(split_part(coalesce(p_location, ''), ',', 1)) || '%'
        OR d.location ~* '^(remote|anywhere)([[:space:]\-–,:]*(worldwide|global|anywhere))?$'
      )
    ORDER BY d.ats_platform, d.company_key, d.external_id, d.last_seen_at DESC
  ) s
  ORDER BY s.tier, s.seen DESC
  LIMIT p_limit
$$;

ALTER FUNCTION public.search_postings_by_occupation(text[], int, text)
  SET plan_cache_mode = force_custom_plan;
