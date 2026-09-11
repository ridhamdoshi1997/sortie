-- Phase 52, section 7 — random sampling for Link Health.
--
-- APPLIED TO THE CACHE PROJECT, not the main one (discovered_postings lives
-- there since the Phase 50 split).
--
-- The first attempt sampled with a random OFFSET and .range() over PostgREST.
-- It returned zero rows every time: a ~700,000-row offset makes Postgres walk
-- the whole relation to find the starting point, which blows the 8s statement
-- timeout, and the client's error branch then silently degraded to an empty
-- sample. That is the exact silent-discard shape this project has been bitten
-- by repeatedly -- an error path that returns [] and reads as "no data".
--
-- TABLESAMPLE SYSTEM picks random disk pages instead, so cost is proportional
-- to the sample and not the table. The percentage is computed by the caller
-- from the live row count. SYSTEM (page-level) rather than BERNOULLI
-- (row-level) is deliberate: BERNOULLI scans every row, which is the thing
-- being avoided. Page-level clustering is acceptable here because the caller
-- reports the sample size and treats the result as an estimate, which it says
-- on the page.

CREATE OR REPLACE FUNCTION public.sample_active_apply_urls(p_percent double precision)
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
    AND d.apply_url IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.sample_active_apply_urls(double precision) FROM public;
