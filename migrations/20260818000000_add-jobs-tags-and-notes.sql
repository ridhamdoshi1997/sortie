-- User-authored tags + a personal free-text notes field on jobs — pure
-- tracker metadata, zero AI, mirrors accomplishments.tags's array shape.
ALTER TABLE public.jobs
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN personal_notes text;
