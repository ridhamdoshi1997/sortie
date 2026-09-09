-- Keep the employer logo the providers already give us.
--
-- LinkedIn's actor returns companyLogoUrl and Indeed's returns companyLogo, and
-- lib/jobScraper.ts already maps both into NormalizedJob.logoUrl. Then
-- storeProviderJobsInIndex dropped it on the floor, because discovered_postings
-- had no column to put it in.
--
-- So the exact, correct, employer-branded logo arrived with every paid search
-- and was discarded -- while the read path fell back to guessing a domain from
-- the apply URL, which for an ATS-hosted job returns the ATS's own mark. That
-- is why every Workday posting wore Workday's logo: not a missing service, a
-- discarded field plus a bad guess.
--
-- LinkedIn and Indeed are 47% of the postings a candidate sees, so this single
-- column is the largest logo fix available, and it costs nothing -- the data is
-- already paid for.
ALTER TABLE public.discovered_postings
  ADD COLUMN IF NOT EXISTS logo_url text;

COMMENT ON COLUMN public.discovered_postings.logo_url IS
  'Employer logo as supplied by the source (LinkedIn/Indeed actors). Authoritative when present; the domain-based guess is only a fallback.';

-- Partial: only rows that HAVE a logo are ever looked up by it, and that is a
-- minority of a 600k-row table.
CREATE INDEX IF NOT EXISTS discovered_postings_logo_idx
  ON public.discovered_postings (company_key) WHERE logo_url IS NOT NULL;

-- One employer's logo, from whichever of its postings carries one. A company's
-- LinkedIn posting can therefore supply the logo for its Greenhouse posting,
-- which is where most of the remaining coverage comes from.
CREATE OR REPLACE FUNCTION public.logo_for_companies(p_keys text[])
RETURNS TABLE (company_key text, logo_url text, domain text)
LANGUAGE sql
STABLE
AS $function$
  SELECT k.company_key,
         (SELECT d.logo_url
            FROM public.discovered_postings d
           WHERE d.company_key = k.company_key
             AND d.logo_url IS NOT NULL
           ORDER BY d.last_seen_at DESC
           LIMIT 1) AS logo_url,
         (SELECT c.domain
            FROM public.company_domains c
           WHERE c.company_key = k.company_key) AS domain
  FROM unnest(p_keys) AS k(company_key)
$function$;
