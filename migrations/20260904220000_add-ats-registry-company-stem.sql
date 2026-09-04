-- company_stem on the registry, matching discovered_postings.company_stem.
--
-- Needed by the discovery harvest (lib/atsDiscoveryHarvest.ts), which asks
-- "is this employer already known to us?" for every company an aggregator
-- returns. Asking that on the raw company_key answers wrongly: the crawl
-- holds bmocampus/cibccampus/tdbank while LinkedIn and Indeed say BMO,
-- CIBC, TD, so a raw-key check would re-add employers we already have and
-- fragment the registry further -- the exact problem the stem exists to fix.
--
-- Same reasoning as the discovered_postings column: a plain column written
-- from lib/companyIdentity.ts's canonicalCompanyKey rather than a GENERATED
-- one, so the qualifier list lives in exactly one place.
ALTER TABLE public.ats_registry ADD COLUMN IF NOT EXISTS company_stem text;

CREATE INDEX IF NOT EXISTS ats_registry_company_stem_idx
  ON public.ats_registry (company_stem);
