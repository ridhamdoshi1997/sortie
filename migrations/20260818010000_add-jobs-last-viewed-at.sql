-- "Recently viewed jobs" — tracks when a user last opened this job's detail
-- page. Applied directly to the live backend; app-code wiring (updating this
-- on page load + a "Recently Viewed" widget) is NOT yet built — this column
-- exists ahead of that code, see context/RESUME.md for the real status.
ALTER TABLE public.jobs
  ADD COLUMN last_viewed_at timestamptz;
