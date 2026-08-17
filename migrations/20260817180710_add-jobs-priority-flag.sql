-- Kanban card research (agy, 2026-08-17): a starred/priority flag lets a
-- user flag "the 2 I actually need to follow up on" within a crowded
-- column, rather than every card in a stage reading as equally important.
ALTER TABLE public.jobs
  ADD COLUMN is_priority boolean NOT NULL DEFAULT false;
