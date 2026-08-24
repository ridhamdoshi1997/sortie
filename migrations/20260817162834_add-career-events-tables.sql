-- §Q1 Career Timeline/Graph — the real per-event history that
-- jobs.application_status (current-state-only) has never captured.
-- Additive alongside existing tables, not a replacement: jobs.application_status
-- stays the cheap current-state cache the Kanban board reads; these log every
-- transition/event with a timestamp so the outcome-loop analytics
-- (build-plan.md §Q3) and a real chronological career timeline have
-- something to aggregate. career_roles (the profiles.work_experience jsonb
-- -> relational migration) is deliberately deferred to a later slice — none
-- of these three tables need it to exist yet (compensation_events.career_role_id
-- stays a bare nullable uuid, not yet FK'd, until that table lands).

CREATE TABLE public.application_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('applied', 'interview_scheduled', 'interview_completed', 'offer_received', 'rejected', 'ghosted', 'withdrawn')),
  event_date timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX application_events_user_id_idx ON public.application_events (user_id);
CREATE INDEX application_events_job_id_idx ON public.application_events (job_id);

ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY application_events_select_own ON public.application_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY application_events_insert_own ON public.application_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY application_events_update_own ON public.application_events
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY application_events_delete_own ON public.application_events
  FOR DELETE USING (auth.uid() = user_id);

-- interview_events is distinct from interview_panel_members: that table is
-- "who" (a named panelist and their researched background), this is "what
-- happened and when". panel_member_id is nullable since not every logged
-- interview event will be tied to a specific named panelist.
CREATE TABLE public.interview_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  panel_member_id uuid REFERENCES public.interview_panel_members(id) ON DELETE SET NULL,
  event_date timestamptz NOT NULL DEFAULT now(),
  outcome text CHECK (outcome IN ('pending', 'passed', 'rejected', 'no_show')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX interview_events_user_id_idx ON public.interview_events (user_id);
CREATE INDEX interview_events_job_id_idx ON public.interview_events (job_id);

ALTER TABLE public.interview_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY interview_events_select_own ON public.interview_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY interview_events_insert_own ON public.interview_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY interview_events_update_own ON public.interview_events
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY interview_events_delete_own ON public.interview_events
  FOR DELETE USING (auth.uid() = user_id);

-- compensation_events — job_id is nullable (a raise/bonus isn't necessarily
-- tied to a tracked job posting). jobs.offer_details (lib/equityDecoder.ts)
-- stays the offer calculator's own storage; this table is the durable event
-- log alongside it, not a replacement for it.
CREATE TABLE public.compensation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  career_role_id uuid,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('offer', 'raise', 'bonus', 'equity_grant')),
  base_salary numeric,
  bonus numeric,
  equity_value numeric,
  effective_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX compensation_events_user_id_idx ON public.compensation_events (user_id);

ALTER TABLE public.compensation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY compensation_events_select_own ON public.compensation_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY compensation_events_insert_own ON public.compensation_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY compensation_events_update_own ON public.compensation_events
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY compensation_events_delete_own ON public.compensation_events
  FOR DELETE USING (auth.uid() = user_id);
