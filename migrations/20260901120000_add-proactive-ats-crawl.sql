-- Proactive ATS crawl (2026-09-01) — the lower-priority half of the
-- 3-phase-plus-crawl redesign validated in context/RESUME.md's "Next
-- session, start here" (the actual lever for closing the volume gap
-- against a funded competitor, per that section's own reasoning: direct-ATS
-- enrichment today is reactive-only, only polling a company's board if a
-- live search already surfaced that company via SerpApi/Adzuna, which
-- structurally means it can never discover a company those aggregators
-- haven't already surfaced, and a real employer posting can sit unindexed
-- by Google for 2-5 days before a reactive-only approach would ever see it).
--
-- Global, NOT per-user — same reasoning ats_registry itself already
-- documents: "which ATS Shopify uses is a fact about the world, not about a
-- user." jobs/job_sources stay per-user by design (see the canonicalization
-- migration's own note), so this can't write into either directly; instead
-- it's a shared cache that a live search's own enrichment step reads from
-- (lib/actions/scraper.actions.ts) ALONGSIDE its existing reactive
-- SerpApi/Adzuna/live-ATS-poll enrichment — a real volume boost from
-- companies this particular search's own aggregator results never
-- surfaced, at zero live-request cost (the crawl already paid for it on
-- its own schedule).
CREATE TABLE IF NOT EXISTS public.discovered_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ats_platform text NOT NULL,
  company_key text NOT NULL,
  company_name text NOT NULL,
  -- The ATS's own posting id — the real per-row uniqueness key alongside
  -- (ats_platform, company_key), since a company's board can (and does)
  -- reuse title text across postings.
  external_id text NOT NULL,
  title text,
  location text,
  description text,
  salary text,
  job_type text,
  apply_url text,
  posted_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discovered_postings_platform_company_external_uidx
  ON public.discovered_postings (ats_platform, company_key, external_id);

-- Powers the live search's own title-relevance lookup — same tsvector/GIN
-- full-text approach the jobs table's own search_vector already uses
-- (migrations/20260828180000_add-full-text-job-search.sql), not a new
-- pattern or a new extension dependency (pg_trgm's availability on this
-- managed Postgres is unconfirmed; to_tsvector is already proven working
-- here). Trigger-maintained for the same reason jobs.search_vector is: the
-- two-arg to_tsvector(regconfig, text) is STABLE, not IMMUTABLE, so a
-- generated column rejects it outright.
ALTER TABLE public.discovered_postings ADD COLUMN IF NOT EXISTS title_tsv tsvector;

CREATE OR REPLACE FUNCTION public.discovered_postings_title_tsv_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.title_tsv := to_tsvector('english', coalesce(NEW.title, ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER discovered_postings_title_tsv_trigger
  BEFORE INSERT OR UPDATE ON public.discovered_postings
  FOR EACH ROW EXECUTE FUNCTION public.discovered_postings_title_tsv_update();

CREATE INDEX IF NOT EXISTS discovered_postings_title_tsv_idx ON public.discovered_postings USING GIN (title_tsv);

-- SECURITY INVOKER default is fine here (unlike search_jobs, this has no
-- per-user auth.uid() filter to enforce — discovered_postings is global
-- reference data with RLS on and zero client policies, only ever read via
-- the admin client, same posture as ats_registry/job_sources). Called from
-- lib/actions/scraper.actions.ts's enrichment step with the search's own
-- title text and a result cap.
CREATE OR REPLACE FUNCTION public.search_discovered_postings(p_query text, p_limit int DEFAULT 30)
RETURNS SETOF public.discovered_postings
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.discovered_postings
  WHERE title_tsv @@ websearch_to_tsquery('english', p_query)
  ORDER BY last_seen_at DESC
  LIMIT p_limit
$$;

-- Same posture as ats_registry/job_sources: only ever written/read via the
-- admin (service-role) client — the proactive crawl cron, and a live
-- search's enrichment step — never a browser session.
ALTER TABLE public.discovered_postings ENABLE ROW LEVEL SECURITY;

-- Independent of ats_registry.last_checked_at/last_success_at, which
-- already mean "when did ATS DISCOVERY (which platform, if any) last run
-- for this company" — this is a separate cursor for "when did the
-- proactive crawl last pull this company's FULL board," so the crawl can
-- pick its next batch (oldest-crawled-first) without disturbing that
-- existing discovery bookkeeping or its own staleness semantics.
ALTER TABLE public.ats_registry ADD COLUMN IF NOT EXISTS last_crawled_at timestamptz;
CREATE INDEX IF NOT EXISTS ats_registry_last_crawled_idx ON public.ats_registry (last_crawled_at);
