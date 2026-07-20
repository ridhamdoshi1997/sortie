ALTER TABLE public.jobs
  ADD COLUMN evaluation jsonb,
  ADD COLUMN recommendation_score numeric;
