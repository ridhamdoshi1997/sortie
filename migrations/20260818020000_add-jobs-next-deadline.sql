-- Deadline tracker / application calendar (build-plan.md §D). A real,
-- user-entered future timestamp (interview date, application deadline,
-- follow-up date) — deliberately distinct from interview_events.event_date,
-- which is a log-time stamp of something that already happened, not a
-- scheduled future time (see context/RESUME.md for why that distinction
-- matters here). One nullable "next deadline" per job, not a full separate
-- events table — matches the existing single-slot pattern already used for
-- marked_unavailable_at/dropped_from_search_at.
ALTER TABLE public.jobs
  ADD COLUMN next_deadline_at timestamptz,
  ADD COLUMN next_deadline_label text;
