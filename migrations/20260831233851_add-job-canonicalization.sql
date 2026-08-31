-- Phase 1 of the job-listing authenticity rework (2026-08-31, direct user
-- request after a full-day investigation found 6+ related bugs — dedup
-- inconsistency, first-seen-data-wins-forever, recency-only display order,
-- no pre-filter before the LLM, reactive-only ATS discovery, legitimacy as
-- a warning label instead of a hide-gate — all stemming from one root
-- cause: the pipeline treats "a search result" and "the canonical job" as
-- the same append-only-log entity instead of a continuously-improving
-- record).
--
-- This migration lays the foundation only: an append-only raw-source
-- table, and the columns + atomic merge RPC needed for a better later
-- source to upgrade an already-stored job in place instead of the
-- original weaker data being frozen forever. Gatekeeping (Phase 2),
-- ranking (Phase 3), and proactive ATS polling (Phase 4) are separate,
-- later migrations.
--
-- Design note: jobs in this app are stored PER USER (jobs.user_id), not as
-- one global shared index across every account — two different users
-- searching the same real posting get two separate rows, each carrying
-- their own match_score/personal_notes/pipeline status. So "canonical"
-- here means "one row per real posting, per user," matching the existing
-- data model, not a single global job index the way Indeed/LinkedIn work.
--
-- job_sources is deliberately append-only and NEVER overwritten. The
-- single-table "just upsert in place" alternative was considered and
-- rejected: if the matching/merge logic has a bug (a real risk in a v1 —
-- confirmed by TWO independent AI research passes converging on this same
-- conclusion), directly-overwritten data is gone forever with no way to
-- recover it. Keeping every raw hit means any matching-logic bug is always
-- fixable by reprocessing this table, not a permanent data loss.
CREATE TABLE IF NOT EXISTS public.job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  canonical_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  -- 'serpapi' | 'adzuna' | 'apify' | 'theirstack' | an ATS platform name
  -- ('greenhouse' | 'lever' | 'ashby' | 'workday' | 'smartrecruiters').
  source_type text NOT NULL,
  -- The source's own id for this listing (SerpApi's htidocid, an ATS's
  -- numeric job id, etc.) when available — kept for provenance/debugging,
  -- not relied on as a match key (see merge_job_source's own comment on
  -- why canonical_key already subsumes the "same source scraped again"
  -- case this would otherwise exist to catch).
  source_job_id text,
  canonical_key text NOT NULL,
  description_hash text,
  title_raw text,
  company_raw text,
  location_raw text,
  description_raw text,
  salary_raw text,
  apply_url_raw text,
  job_type_raw text,
  -- Full normalized-scrape payload, kept verbatim — the actual safety net
  -- this table exists for for future reprocessing.
  raw_payload jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_sources_user_canonical_idx ON public.job_sources (user_id, canonical_key);
CREATE INDEX IF NOT EXISTS job_sources_canonical_job_idx ON public.job_sources (canonical_job_id);

-- Same posture as ats_registry (migrations/20260831120000_add-ats-registry.sql):
-- only ever written/read via the admin (service-role) client from
-- lib/jobCanonicalization.ts, never a browser session — RLS on, zero
-- client policies.
ALTER TABLE public.job_sources ENABLE ROW LEVEL SECURITY;

-- canonical_key: normalized company|title|location fingerprint, the
-- primary cross-source match key (tier 2 of the 3-tier match — tier 1,
-- "same source re-scraped," collapses into this automatically since a
-- deterministic normalizer produces the same key both times; tier 3,
-- description_hash, is the fallback below for when two sources phrase the
-- same real posting's title differently).
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS canonical_key text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS description_hash text;
-- Which source currently "wins" this job's descriptive fields, and how
-- authoritative that source is (higher wins on the next merge). Direct ATS
-- boards rank highest (ground truth, ONE call away from the employer
-- itself); generic aggregators lowest.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS primary_source_type text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS source_priority integer NOT NULL DEFAULT 0;

-- Superseded by canonical_key as the real per-user uniqueness/merge key —
-- external_id (a single source's own id) can't distinguish "the same real
-- job, found via two different sources" from "two different real jobs,"
-- which is exactly the bug this whole migration fixes. Kept as a plain
-- descriptive column (still useful for provenance), just no longer a
-- uniqueness enforcement point.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_user_external_id_key;

-- Backfill every existing row with a real canonical_key using the closest
-- SQL approximation of the app's own normalizer (lib/jobCanonicalization.ts)
-- — lowercase, strip non-alphanumerics, collapse whitespace. Good enough
-- for existing data to participate in future merges; new writes always go
-- through the exact JS normalizer.
UPDATE public.jobs
SET canonical_key =
  regexp_replace(lower(coalesce(company, '')), '[^a-z0-9]+', '', 'g') || '|' ||
  regexp_replace(trim(regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', ' ', 'g')), '\s+', ' ', 'g') || '|' ||
  regexp_replace(lower(coalesce(location, '')), '[^a-z0-9]+', '', 'g')
WHERE canonical_key IS NULL;

UPDATE public.jobs SET source_priority = 10, primary_source_type = coalesce(source, 'unknown')
WHERE primary_source_type IS NULL;

-- Resolve pre-existing duplicates the backfill above just exposed — real
-- duplicate rows already sitting in the data, produced by the very
-- dedup-inconsistency bug this migration exists to fix. Nothing is
-- deleted: keep the most recently found row per (user_id, canonical_key)
-- group with a clean key, and disambiguate every other row in that group
-- by appending its own id, so the unique index below has something to
-- enforce going forward without losing any existing row or its history.
WITH ranked AS (
  SELECT id, user_id, canonical_key,
         row_number() OVER (
           PARTITION BY user_id, canonical_key
           ORDER BY found_at DESC NULLS LAST, created_at DESC
         ) AS rn
  FROM public.jobs
  WHERE canonical_key IS NOT NULL
)
UPDATE public.jobs j
SET canonical_key = j.canonical_key || '|dup-' || j.id::text
FROM ranked r
WHERE j.id = r.id AND r.rn > 1;

-- Partial (canonical_key is never NULL for a live row after the backfill
-- above, but a future column addition or manual row could still leave one
-- null — excluding those keeps the index valid without a NOT NULL
-- constraint this migration doesn't otherwise need) unique index, the real
-- per-user uniqueness enforcement merge_job_source's ON CONFLICT targets.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_canonical_key_uidx ON public.jobs (user_id, canonical_key) WHERE canonical_key IS NOT NULL;

-- Atomic merge: append the raw source record, then upsert the canonical
-- jobs row by (user_id, canonical_key), letting a higher-priority source
-- overwrite the descriptive fields of a lower-priority one. Done as ONE
-- SECURITY DEFINER function (not app-level SELECT-then-INSERT/UPDATE) so
-- concurrent calls for the same real job — e.g. an ATS-enrichment hit and
-- a SerpApi hit for the same posting landing in the same search — can't
-- race each other into creating two rows; Postgres serializes conflicting
-- upserts on the same key correctly, which app-level check-then-act code
-- cannot guarantee.
CREATE OR REPLACE FUNCTION public.merge_job_source(
  p_user_id uuid,
  p_run_id uuid,
  p_source_type text,
  p_source_priority integer,
  p_canonical_key text,
  p_description_hash text,
  p_source_job_id text,
  p_raw_payload jsonb,
  p_title text,
  p_company text,
  p_location text,
  p_description text,
  p_salary text,
  p_salary_min numeric,
  p_salary_max numeric,
  p_job_type text,
  p_url text,
  p_source text,
  p_external_id text,
  p_external_apply_url text,
  p_raw_apply_options jsonb,
  p_posted_at timestamptz,
  p_company_logo_url text
) RETURNS public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_job public.jobs;
  v_target_key text := p_canonical_key;
  v_existing_key text;
BEGIN
  -- Tier 3 fallback: same user, identical normalized description text, but
  -- a differently-worded title/location meant the tier-2 fingerprint
  -- missed it (the same real posting mirrored verbatim across two boards
  -- with a slightly different title). Reusing the EXISTING job's own
  -- canonical_key as the upsert target lands this source on that same row
  -- instead of creating a near-duplicate.
  IF p_description_hash IS NOT NULL THEN
    SELECT canonical_key INTO v_existing_key
    FROM public.jobs
    WHERE user_id = p_user_id AND description_hash = p_description_hash AND canonical_key IS DISTINCT FROM p_canonical_key
    LIMIT 1;
    IF v_existing_key IS NOT NULL THEN
      v_target_key := v_existing_key;
    END IF;
  END IF;

  INSERT INTO public.jobs (
    user_id, external_id, title, company, location, description, salary,
    salary_min, salary_max, job_type, url, source, external_apply_url,
    raw_apply_options, posted_at, company_logo_url, run_id,
    canonical_key, description_hash, primary_source_type, source_priority,
    dropped_from_search_at
  ) VALUES (
    p_user_id, p_external_id, p_title, p_company, p_location, p_description, p_salary,
    p_salary_min, p_salary_max, p_job_type, p_url, p_source, p_external_apply_url,
    p_raw_apply_options, p_posted_at, p_company_logo_url, p_run_id,
    v_target_key, p_description_hash, p_source_type, p_source_priority,
    NULL
  )
  ON CONFLICT (user_id, canonical_key) WHERE canonical_key IS NOT NULL
  DO UPDATE SET
    -- A higher-or-equal-priority source wins the descriptive fields; a
    -- lower-priority source finding a job already captured from a better
    -- source only refreshes the bookkeeping below, never regresses
    -- already-good data. This is the direct fix for "first-seen data wins
    -- forever" — the opposite is now true: best-seen data wins.
    title = CASE WHEN EXCLUDED.source_priority >= public.jobs.source_priority THEN EXCLUDED.title ELSE public.jobs.title END,
    company = CASE WHEN EXCLUDED.source_priority >= public.jobs.source_priority THEN EXCLUDED.company ELSE public.jobs.company END,
    location = CASE WHEN EXCLUDED.source_priority >= public.jobs.source_priority THEN EXCLUDED.location ELSE public.jobs.location END,
    description = CASE WHEN EXCLUDED.source_priority >= public.jobs.source_priority THEN EXCLUDED.description ELSE public.jobs.description END,
    job_type = CASE WHEN EXCLUDED.source_priority >= public.jobs.source_priority THEN EXCLUDED.job_type ELSE public.jobs.job_type END,
    url = CASE WHEN EXCLUDED.source_priority >= public.jobs.source_priority THEN EXCLUDED.url ELSE public.jobs.url END,
    external_apply_url = CASE WHEN EXCLUDED.source_priority >= public.jobs.source_priority THEN EXCLUDED.external_apply_url ELSE public.jobs.external_apply_url END,
    raw_apply_options = CASE WHEN EXCLUDED.source_priority >= public.jobs.source_priority THEN EXCLUDED.raw_apply_options ELSE public.jobs.raw_apply_options END,
    -- Salary/logo: fallback-only regardless of priority, matching this
    -- codebase's existing convention elsewhere (lib/inngest/functions.ts)
    -- of never overwriting a real stored value with a blank one.
    salary = COALESCE(public.jobs.salary, EXCLUDED.salary),
    salary_min = COALESCE(public.jobs.salary_min, EXCLUDED.salary_min),
    salary_max = COALESCE(public.jobs.salary_max, EXCLUDED.salary_max),
    company_logo_url = COALESCE(public.jobs.company_logo_url, EXCLUDED.company_logo_url),
    description_hash = CASE WHEN EXCLUDED.source_priority >= public.jobs.source_priority THEN EXCLUDED.description_hash ELSE public.jobs.description_hash END,
    primary_source_type = CASE WHEN EXCLUDED.source_priority >= public.jobs.source_priority THEN EXCLUDED.primary_source_type ELSE public.jobs.primary_source_type END,
    source_priority = GREATEST(public.jobs.source_priority, EXCLUDED.source_priority),
    -- Bookkeeping always refreshes regardless of priority — this job is
    -- part of the current search either way.
    run_id = EXCLUDED.run_id,
    dropped_from_search_at = NULL
  RETURNING * INTO v_job;

  INSERT INTO public.job_sources (
    user_id, canonical_job_id, run_id, source_type, source_job_id,
    canonical_key, description_hash, title_raw, company_raw, location_raw,
    description_raw, salary_raw, apply_url_raw, job_type_raw, raw_payload
  ) VALUES (
    p_user_id, v_job.id, p_run_id, p_source_type, p_source_job_id,
    p_canonical_key, p_description_hash, p_title, p_company, p_location,
    p_description, p_salary, p_external_apply_url, p_job_type, p_raw_payload
  );

  RETURN v_job;
END;
$$;

-- Admin-client-only (matches ats_registry / evaluateJobsAsync's own writes
-- to jobs) — no GRANT to authenticated. lib/jobCanonicalization.ts calls
-- this via createAdminDbClient(), same as scraper.actions.ts already does
-- for ats_registry access.
