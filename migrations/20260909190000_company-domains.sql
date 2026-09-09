-- Employer domains for EVERY company we hold postings for, not just the ones
-- that came through the ATS registry.
--
-- Logos were wrong or missing at scale for two separate reasons:
--
--   1. The domain was guessed from the apply URL's host, so an ATS-hosted job
--      resolved to the ATS. Every Workday posting wore Workday's own logo --
--      cibc.wd3.myworkdayjobs.com -> myworkdayjobs.com -> Workday's mark.
--
--   2. The real resolver (company name -> domain, via Clearbit's free
--      autocomplete) wrote only to ats_registry.company_domain, which covers
--      registry companies. LinkedIn and Indeed postings never enter that
--      registry, so 47% of what a candidate sees had no path to a logo at all.
--      It had also only processed 1,743 of 68,442 rows.
--
-- This table is keyed by company_key, which every posting carries regardless of
-- source, so one lookup serves ATS, LinkedIn and Indeed alike. It lives in the
-- cache project beside discovered_postings so the search can join it without a
-- cross-database call.
--
-- `resolved_at` with a NULL `domain` is a recorded MISS, not an unattempted
-- row: without that distinction a re-run would retry the same dead names
-- forever, and Clearbit genuinely has no domain for many small employers.
CREATE TABLE IF NOT EXISTS public.company_domains (
  company_key  text PRIMARY KEY,
  company_name text NOT NULL,
  domain       text,
  resolved_at  timestamptz NOT NULL DEFAULT now(),
  attempts     int NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.company_domains IS
  'company_key -> employer web domain, for logo lookup. NULL domain with a resolved_at is a recorded miss, not an unattempted row.';

CREATE INDEX IF NOT EXISTS company_domains_unresolved_idx
  ON public.company_domains (resolved_at) WHERE domain IS NULL;

-- Companies with active postings that still have no domain, most postings
-- first -- so a partial run buys the most visible coverage.
CREATE OR REPLACE FUNCTION public.companies_needing_domain(p_limit int DEFAULT 500)
RETURNS TABLE (company_key text, company_name text, postings int)
LANGUAGE sql
STABLE
AS $function$
  SELECT d.company_key,
         MIN(d.company_name) AS company_name,
         COUNT(*)::int       AS postings
  FROM public.discovered_postings d
  LEFT JOIN public.company_domains c ON c.company_key = d.company_key
  WHERE d.is_active
    AND c.company_key IS NULL
  GROUP BY d.company_key
  ORDER BY COUNT(*) DESC
  LIMIT p_limit
$function$;
