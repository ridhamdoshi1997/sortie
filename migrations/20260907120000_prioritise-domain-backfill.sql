-- Which companies to resolve a logo domain for FIRST.
--
-- The backfill previously took whatever ats_registry returned for
-- "company_domain IS NULL LIMIT 200", which is effectively alphabetical: it
-- spent its first runs on _nology, [solidcore] and 1000heads while BMO, TD and
-- Scotiabank -- companies whose jobs are actually on screen -- kept showing a
-- blank building icon. With 68,404 companies to get through, that ordering
-- decides whether logos appear this week or next month.
--
-- Ordering by cached posting count puts the employers a candidate actually
-- sees at the front. Companies with no cached postings cannot appear in a
-- search result at all, so they are excluded entirely rather than merely
-- deprioritised.
CREATE OR REPLACE FUNCTION public.companies_needing_logo_domain(p_limit int)
RETURNS TABLE(company_key text, company_name text)
LANGUAGE sql
STABLE
AS $$
  SELECT r.company_key, r.company_name
  FROM public.ats_registry r
  JOIN (
    SELECT d.company_key, count(*) AS postings
    FROM public.discovered_postings d
    WHERE d.is_active
    GROUP BY d.company_key
  ) counts ON counts.company_key = r.company_key
  WHERE r.company_domain IS NULL
  ORDER BY counts.postings DESC
  LIMIT p_limit
$$;
