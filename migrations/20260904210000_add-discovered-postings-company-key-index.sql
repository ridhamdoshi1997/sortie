-- Index for the posting-liveness cross-reference (lib/postingLiveness.ts).
--
-- The existing unique index is on (ats_platform, company_key, external_id).
-- company_key is its SECOND column, so a lookup filtering on company_key
-- alone cannot use it and falls back to a sequential scan of all ~487,000
-- rows. Measured before this index: the liveness query exceeded the
-- statement timeout outright and every job degraded to "unknown".
--
-- Not partial on is_active: this lookup deliberately reads INACTIVE rows
-- too. A closed posting is the entire point -- it is how we prove an
-- aggregator is still advertising a role the employer has already taken
-- down. Restricting the index to is_active would make the interesting half
-- of the question unanswerable.
CREATE INDEX IF NOT EXISTS discovered_postings_company_key_idx
  ON public.discovered_postings (company_key);
