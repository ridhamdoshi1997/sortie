-- company_stem: the employer's identifying stem, with corporate qualifiers
-- removed ("bmocampus" -> "bmo", "tdbank" -> "td").
--
-- Exists so the posting-liveness cross-reference (lib/postingLiveness.ts)
-- can match an aggregator's employer name against what our own crawl
-- stores. Measured before this column: of 18 employers returned by a real
-- LinkedIn+Indeed search, exactly ONE matched our crawl on the raw key --
-- the aggregators say "BMO", "CIBC", "TD" while the crawl holds
-- bmocampus, cibccampus, tdbank.
--
-- Deliberately a plain column rather than a GENERATED one: the stemming
-- rules are a closed list of qualifier words maintained in TypeScript
-- (lib/companyIdentity.ts's canonicalCompanyKey), and duplicating that list
-- in SQL would guarantee the two drift apart. The crawl writer populates it
-- with the same function the reader uses, so both sides cannot disagree.
ALTER TABLE public.discovered_postings ADD COLUMN IF NOT EXISTS company_stem text;

CREATE INDEX IF NOT EXISTS discovered_postings_company_stem_idx
  ON public.discovered_postings (company_stem);
