-- Whole-résumé quality grade (10-dimension role-fit matrix + narrative
-- insight + vulnerabilities + per-bullet issues) for a tailored per-job
-- résumé, same shape as resumes.analysis but scoped to a specific job's
-- application row instead of a résumé slot. Capped tightly (shares the
-- resume_quality_analysis usage bucket, 3/day) — only refreshed on demand
-- or after Regenerate, never on every small edit.
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS quality_analysis jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS quality_analyzed_at timestamptz;
