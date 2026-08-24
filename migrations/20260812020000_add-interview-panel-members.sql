-- Interview Panel Topology — interviewer names come from the candidate
-- themselves (the employer tells them who's interviewing), not discovered
-- automatically. A job can have multiple panelists, so this is a child
-- table rather than a single jsonb column on jobs.
CREATE TABLE public.interview_panel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  researched_background jsonb,
  researched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interview_panel_members_job_id_idx ON public.interview_panel_members (job_id);

ALTER TABLE public.interview_panel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY interview_panel_members_select_own ON public.interview_panel_members
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY interview_panel_members_insert_own ON public.interview_panel_members
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY interview_panel_members_update_own ON public.interview_panel_members
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY interview_panel_members_delete_own ON public.interview_panel_members
  FOR DELETE USING (auth.uid() = user_id);
