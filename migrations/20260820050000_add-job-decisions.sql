-- Q3 fast-follow (build-plan.md §Q3): captures the "did you apply?" moment
-- for jobs the user looked at but didn't act on -- application_events alone
-- only exists for jobs someone DID apply to. One row per (user, job),
-- latest decision wins on re-decide (a job hidden then later applied to
-- should read as "applied", not show up twice).
CREATE TABLE public.job_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('applied', 'skipped')),
  skip_reason TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

CREATE INDEX idx_job_decisions_user_id ON public.job_decisions (user_id);

ALTER TABLE public.job_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_decisions_select_own" ON public.job_decisions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "job_decisions_insert_own" ON public.job_decisions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "job_decisions_update_own" ON public.job_decisions
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "job_decisions_delete_own" ON public.job_decisions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_decisions TO authenticated;
