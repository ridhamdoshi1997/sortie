-- Whole-résumé quality analysis (grade + 10-dimension role-fit matrix +
-- narrative-alignment insight + interviewer-skepticism vulnerabilities +
-- per-bullet issues), scoped per résumé slot — distinct from the existing
-- job-fit gap check (agent/resumeGap.ts, jobs.resume_analysis usage key,
-- résumé-vs-one-specific-job). This is holistic and re-run on demand
-- (Re-Analyze), so it lives on the résumé row itself, not per-job.
ALTER TABLE public.resumes
  ADD COLUMN analysis jsonb,
  ADD COLUMN analyzed_at timestamptz;
