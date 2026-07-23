-- Sticky action bar needs a Save/Hide toggle, matching JobRight's job-detail
-- page (build-plan.md §H1). Neither existed anywhere in the app before this
-- — confirmed no is_saved/is_hidden columns or save/hide code in the repo.

ALTER TABLE public.jobs
  ADD COLUMN is_saved boolean NOT NULL DEFAULT false,
  ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
