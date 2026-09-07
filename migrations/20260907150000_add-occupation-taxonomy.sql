-- Occupation taxonomy for job-title relevance.
--
-- The string matcher this replaces could not tell related occupations from
-- unrelated ones, because word overlap is not the signal. Requiring ANY word to
-- match returned Health and Safety Advisors for a "Financial Advisor" search;
-- requiring EVERY word then rejected "Financial Planner", which is the same
-- profession. Measured on one real search: 333 jobs collected, 286 rejected,
-- and the rejected list was full of Financial Planners, Investment Advisors and
-- Wealth Advisors -- roughly what JobRight shows for the same query.
--
-- O*NET (US Department of Labor, CC BY 4.0, free for commercial use with
-- attribution) maps 54,269 everyday job titles onto 1,016 occupations. Two
-- titles are related when they share an occupation group, which is exactly the
-- distinction that was missing:
--   Financial Advisor / Financial Planner / Investment Advisor -> 13-2052
--   Health and Safety Advisor                                  -> 19-5011
--   Financial Analyst                                          -> 13-2051
--
-- Source: https://www.onetcenter.org/dl_files/database/db_31_0_csv/job_titles.csv
-- Attribution is required by the licence and lives in lib/occupationMatch.ts.
--
-- Codes are stored as the 7-character GROUP (13-2052), not the full
-- 13-2052.00 detail code: the detail suffix splits one occupation into
-- specialisations that are all the same job to a candidate.
CREATE TABLE IF NOT EXISTS public.occupation_titles (
  title     text NOT NULL,
  soc_group text NOT NULL,
  PRIMARY KEY (title, soc_group)
);

-- The only access pattern: given a normalised title, which occupations is it?
CREATE INDEX IF NOT EXISTS occupation_titles_title_idx ON public.occupation_titles (title);

-- Reference data, same posture as ats_registry: RLS on, no client policies,
-- reachable only through the service-role client.
ALTER TABLE public.occupation_titles ENABLE ROW LEVEL SECURITY;
