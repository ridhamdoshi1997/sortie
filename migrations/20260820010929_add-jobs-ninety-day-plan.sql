-- First-90-days success plan (build-plan.md §F) -- persisted like every
-- other offer-stage generated read (leverage_synthesis, negotiation_script).
ALTER TABLE public.jobs ADD COLUMN ninety_day_plan JSONB;
