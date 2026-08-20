-- Follow-up timing nudges (build-plan.md §C's "timing nudges" half).
-- Tracks whether a push nudge has already been sent for this job, so the
-- weekly cron never repeats the same nudge for the same application.
ALTER TABLE public.jobs ADD COLUMN follow_up_nudged_at TIMESTAMPTZ;
