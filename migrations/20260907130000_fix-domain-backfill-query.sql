-- The previous version of this function GROUPed 450,000 postings by company_key
-- and joined the result to a 68,404-row registry on every call. Through
-- PostgREST -- which runs under an 8s statement timeout -- it was cancelled,
-- and backfillCompanyDomains reported that cancellation as "0 companies need a
-- domain", because it returned the same {resolved:0, attempted:0} for an error
-- as for an empty queue. So the backfill looked finished after 400 companies
-- while 19,000 still had no logo.
--
-- EXISTS instead of GROUP BY: it probes discovered_postings_company_key_idx
-- once per candidate registry row and stops at the first hit, rather than
-- aggregating the whole table to produce a count that was only ever used for
-- ordering. The ordering is dropped with it -- at 200 per run, four runs an
-- hour, the 19,353 companies that actually have postings are covered in about
-- a day either way.
CREATE OR REPLACE FUNCTION public.companies_needing_logo_domain(p_limit int)
RETURNS TABLE(company_key text, company_name text)
LANGUAGE sql
STABLE
AS $$
  SELECT r.company_key, r.company_name
  FROM public.ats_registry r
  WHERE r.company_domain IS NULL
    AND EXISTS (
      SELECT 1 FROM public.discovered_postings d
      WHERE d.company_key = r.company_key AND d.is_active
    )
  LIMIT p_limit
$$;

ALTER FUNCTION public.companies_needing_logo_domain(int) SET plan_cache_mode = force_custom_plan;
