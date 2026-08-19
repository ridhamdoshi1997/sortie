-- "Why I Left" private log (build-plan.md §E) — a private, structured
-- reflection captured once a job ends in rejection. Deliberately two plain
-- nullable columns on the existing jobs row rather than a new table: it's
-- a real 1:1 relationship (one job, one reflection), and jobs already has
-- its own RLS own-row policies, so no new RLS surface is needed. v1 scope
-- is capture only — surfacing past reflections when evaluating a similar
-- role later is a real, deferred fast-follow, not built this pass.
ALTER TABLE public.jobs ADD COLUMN reflection_loved TEXT;
ALTER TABLE public.jobs ADD COLUMN reflection_avoid TEXT;
