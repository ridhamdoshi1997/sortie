-- Retention for the two tables that grow per USER, which are the only unbounded
-- ones left.
--
-- Measured 2026-09-08, with a single real account: discovered_postings is capped
-- at 450k rows by eviction, ats_registry is a finite company list and
-- occupation_titles is a fixed taxonomy -- all bounded. What is not bounded is
-- user data, at roughly 42 KB per saved job (10 KB in jobs, plus ~9 job_sources
-- rows at 3.6 KB each). One account with 557 jobs already occupies 23 MB, so a
-- 500 MB plan supports on the order of twenty active users. The crawl cache was
-- never the scaling limit; it simply arrived first.
--
-- Neither policy touches anything a candidate can see. Raw payloads are
-- provenance for debugging a scrape, and the description of a job the user has
-- already archived is not shown anywhere.

-- Raw scrape payloads: diagnostic for a few days, dead weight afterwards.
-- Nulls the payload rather than deleting the row, because job_sources is also
-- the provenance chain merge_job_source walks to decide which source wins for a
-- canonical job -- deleting rows would corrupt that; emptying one column
-- does not.
CREATE OR REPLACE FUNCTION public.prune_job_source_payloads(p_days int DEFAULT 7)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_pruned int;
BEGIN
  UPDATE public.job_sources
     SET raw_payload = NULL
   WHERE raw_payload IS NOT NULL
     AND discovered_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_pruned = ROW_COUNT;
  RETURN v_pruned;
END;
$$;

-- Descriptions on HIDDEN jobs (there is no status='archived'; the column that
-- actually gates rendering is is_hidden, which the find-jobs query filters on). jobs averages 10 KB a row and the description
-- is nearly all of it. An archived job is out of the candidate's active list, so
-- the full text earns nothing; the row, its score and its link all stay.
CREATE OR REPLACE FUNCTION public.truncate_archived_job_descriptions(p_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_trimmed int;
BEGIN
  UPDATE public.jobs
     SET description = left(description, 400)
   WHERE description IS NOT NULL
     AND length(description) > 400
     AND is_hidden                      -- never rendered to the candidate
     AND NOT is_saved                   -- a saved job keeps its full text
     AND created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_trimmed = ROW_COUNT;
  RETURN v_trimmed;
END;
$$;

-- Reports index bloat so a repeat of 2026-09-08 is noticed rather than
-- discovered when the plan limit is hit. Bulk UPDATEs rewrite every index entry
-- and the dead ones are not reclaimed by autovacuum: two full-table backfills
-- inflated these indexes from ~101 MB to 186 MB, which is what pushed the
-- database over its 500 MB limit.
--
-- Deliberately a REPORT, not a fix. REINDEX CONCURRENTLY cannot run inside a
-- transaction, and every PostgREST RPC is one, so the repair belongs in
-- scripts/reindex-postings.mjs over a direct connection.
CREATE OR REPLACE FUNCTION public.index_bloat_report()
RETURNS TABLE (index_name text, size_bytes bigint, pretty text, scans bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT indexrelname::text, pg_relation_size(indexrelid),
         pg_size_pretty(pg_relation_size(indexrelid)), idx_scan
  FROM pg_stat_user_indexes
  WHERE relname = 'discovered_postings'
  ORDER BY pg_relation_size(indexrelid) DESC;
$$;
