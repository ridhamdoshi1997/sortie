-- Posting freshness ("2 days ago", "6 hours ago") from JobRight's teardown
-- (build-plan.md §H1). Confirmed live against a real SerpApi Google Jobs
-- response that detected_extensions.posted_at carries exactly this relative
-- string for free — lib/jobScraper.ts just never extracted it before now.
-- A separate structured work-mode field was investigated in the same live
-- check and does NOT exist in SerpApi's response (only sometimes embedded
-- in free-text titles like "(Hybrid)") — not adding a column that would
-- overclaim precision we don't have.

ALTER TABLE public.jobs
  ADD COLUMN posted_at text;
