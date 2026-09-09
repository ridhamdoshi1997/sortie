-- Persist LinkedIn's applicant count.
--
-- The actor already returns it and lib/jobScraper.ts already carries it as
-- NormalizedJob.applicantCount -- with a comment calling it "one of the few
-- facts that genuinely changes whether a candidate should bother applying" --
-- and then nothing stored it. Same shape of loss as the provider logos: the
-- data arrived with every paid search and was dropped for want of a column.
--
-- Kept as TEXT because LinkedIn phrases it rather than counting it: "Be among
-- the first 25 applicants", "52 applicants", "Over 100 applicants". Parsing
-- that into an integer would throw away the distinction between "under 25"
-- and "exactly 25", which is the part a candidate cares about.
--
-- This is also what makes the "Be an early applicant" badge honest. It
-- currently infers earliness from elapsed time, which overstates a posting
-- that drew 500 applicants in nine hours.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS applicant_count text;

COMMENT ON COLUMN public.jobs.applicant_count IS
  'LinkedIn''s own phrasing, e.g. "Be among the first 25 applicants" or "52 applicants". Text, not a number: the phrasing carries the meaning.';
