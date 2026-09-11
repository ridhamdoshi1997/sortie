-- Phase 52, section 7 follow-up — APPLIED TO THE CACHE PROJECT.
--
-- The first version of sample_active_apply_urls() had no LIMIT. TABLESAMPLE
-- SYSTEM picks random disk pages, which is random I/O, and on this shared
-- free tier that is exactly the cold-cache pattern Phase 48/49 already
-- documented as slow. Sampling ~0.9% of a 550 MB table meant reading
-- thousands of scattered pages and then filtering them, which intermittently
-- blew the 8s statement timeout -- observed live as a run of
-- "[linkHealth] cache sample failed: canceling statement due to statement
-- timeout" once the page was rendered repeatedly.
--
-- Adding LIMIT lets Postgres stop as soon as it has enough rows instead of
-- materializing the whole sampled set. The caller only ever keeps 1,000 rows
-- (PostgREST's max-rows ceiling) so producing more was pure waste.
CREATE OR REPLACE FUNCTION public.sample_active_apply_urls(p_percent double precision, p_limit integer DEFAULT 1000)
RETURNS TABLE(external_id text, company_name text, title text, apply_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT d.external_id, d.company_name, d.title, d.apply_url
  FROM public.discovered_postings AS d
  TABLESAMPLE SYSTEM (p_percent)
  WHERE d.is_active = true
    AND d.apply_url IS NOT NULL
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.sample_active_apply_urls(double precision, integer) FROM public;
