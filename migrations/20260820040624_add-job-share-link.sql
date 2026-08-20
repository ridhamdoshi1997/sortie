-- Shareable public evaluation link (build-plan.md §I). A user can opt a
-- single job's evaluation into a public, unauthenticated read via a random
-- token. The base `jobs` table stays fully owner-only (no RLS change) --
-- public access goes only through a narrow projection view exposing the
-- user's own AI evaluation output, never the scraped posting text/salary/
-- personal notes/application status/etc.

ALTER TABLE public.jobs ADD COLUMN share_token TEXT UNIQUE;

CREATE INDEX idx_jobs_share_token ON public.jobs (share_token) WHERE share_token IS NOT NULL;

-- Public projection view -- runs with the view owner's privileges (not
-- security_invoker), deliberately bypassing jobs' owner-only RLS for this
-- one whitelisted column set, per insforge-cli's "public projections"
-- pattern. Only rows the owner explicitly opted in (share_token IS NOT
-- NULL) are visible, and only these columns -- never SELECT *.
CREATE VIEW public.job_shares AS
SELECT
  share_token,
  title,
  company,
  location,
  match_score,
  overall_grade,
  match_reason,
  evaluation,
  found_at
FROM public.jobs
WHERE share_token IS NOT NULL;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON public.job_shares TO anon, authenticated;
