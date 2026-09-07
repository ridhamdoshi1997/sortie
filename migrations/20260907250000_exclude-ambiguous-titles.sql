-- Stop generic titles dragging unrelated jobs into an occupation search.
--
-- Reported: a "Financial Advisor" search returned Sales Managers, Account
-- Managers and Sales Representatives from the crawl. The cause is in O*NET
-- itself, not our matching -- it files "account manager", "sales associate" and
-- "sales representative" under 13-2052 and 41-3031, the two occupations
-- "financial advisor" belongs to. Expanding the search to all 146 titles in
-- those occupations therefore pulled in generic sales terms, which match
-- thousands of unrelated postings.
--
-- The signal that separates them is how many OCCUPATIONS a title belongs to:
--   sales associate / sales representative   7
--   account manager                          5
--   financial advisor                        2
--   financial planner / investment advisor   1
--   wealth advisor / securities trader       1
--
-- A title spanning many occupations describes a level or a function, not a
-- profession, so it is useless for deciding "is this the same kind of job".
-- Counted once here rather than recomputed per search.
ALTER TABLE public.occupation_titles ADD COLUMN IF NOT EXISTS occupation_count int;

UPDATE public.occupation_titles ot
SET occupation_count = counts.n
FROM (SELECT title, count(DISTINCT soc_group)::int AS n FROM public.occupation_titles GROUP BY title) counts
WHERE counts.title = ot.title
  AND (ot.occupation_count IS DISTINCT FROM counts.n);

CREATE INDEX IF NOT EXISTS occupation_titles_soc_unambiguous_idx
  ON public.occupation_titles (soc_group) WHERE occupation_count <= 2;
