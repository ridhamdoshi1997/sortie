-- Phase "relevance pre-filter" of the job-listing authenticity rework
-- (2026-08-31 research day, settled after two independent AI research
-- passes explicitly rejected building an embeddings-based pre-filter for
-- this product's current scale — the free alternative is this: reuse the
-- jobs.search_vector column already built for global full-text search
-- (migrations/20260828180000_add-full-text-job-search.sql) to rank a
-- search's own not-yet-evaluated jobs against the CANDIDATE's real
-- profile (skills, desired titles — structured data that already exists
-- before any AI evaluation runs, unlike a job's own AI-extracted fields,
-- which would be circular to depend on here), and only send the top ~20
-- most relevant to the expensive 10-dimension LLM rubric. Zero new
-- extension, zero new column, zero external API call.
--
-- SECURITY INVOKER (the default) — same posture as search_jobs() itself —
-- so this runs as the calling role and jobs' own RLS policy still
-- applies; the explicit user_id filter below is defense-in-depth, not a
-- substitute for RLS.
CREATE OR REPLACE FUNCTION public.rank_jobs_by_relevance(p_job_ids uuid[], p_query text)
RETURNS TABLE (id uuid, rank real)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    j.id,
    ts_rank(j.search_vector, websearch_to_tsquery('english', p_query)) AS rank
  FROM public.jobs j
  WHERE j.user_id = auth.uid()
    AND j.id = ANY(p_job_ids)
$$;

GRANT EXECUTE ON FUNCTION public.rank_jobs_by_relevance(uuid[], text) TO authenticated;
