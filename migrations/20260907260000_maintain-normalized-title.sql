-- Keep normalized_title correct on every write.
--
-- 20260907190000 added the column and backfilled it, but nothing maintained it.
-- Every posting written afterwards -- from the 15-minute crawl AND from indexed
-- provider results -- had normalized_title NULL, and the occupation search
-- matches on that column, so new jobs were INVISIBLE to the main search path.
-- 7,754 rows had accumulated within hours. The index was silently degrading
-- from the moment the column shipped.
--
-- Caught by testing the self-healing claim end to end: a Pharmacist search
-- fetched 203 provider jobs and persisted 100, and the index still returned 3.
-- Asserting it would have hidden this.
--
-- Maintained by the trigger that already keeps title_tsv in step, rather than by
-- the two write paths remembering to compute it. A derived column that depends
-- on callers doing the right thing is a column that will drift again -- this one
-- did, within a day.
CREATE OR REPLACE FUNCTION public.discovered_postings_title_tsv_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.title_tsv := to_tsvector('english', coalesce(NEW.title, ''));
  NEW.normalized_title := public.normalize_job_title(NEW.title);
  RETURN NEW;
END;
$$;

-- Repair everything written since the column was added.
UPDATE public.discovered_postings
SET normalized_title = public.normalize_job_title(title)
WHERE normalized_title IS NULL;
