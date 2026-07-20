ALTER TABLE public.jobs
  ADD COLUMN overall_grade text
    CHECK (overall_grade IN ('A', 'B', 'C', 'D', 'F'));
