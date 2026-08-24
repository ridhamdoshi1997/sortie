-- Job-description decoder (build-plan.md §B) — classifies this job's own
-- already-extracted Required list into must-have vs likely padding.
-- Persisted like every other button-triggered job-scoped AI read
-- (trap_door_predictions, strategic_moat, etc.).
ALTER TABLE public.jobs ADD COLUMN jd_decoder JSONB;
