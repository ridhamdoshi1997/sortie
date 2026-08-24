-- Résumé Editor Workspace: a tailored résumé becomes a real independent
-- snapshot the moment it's generated (resume_sections — all 4 content
-- sections, including skills/education which were only ever pulled live
-- from `profiles` before this), plus its own per-copy style settings
-- (resume_style). Editing either only ever touches this row, never
-- `profiles` — the base résumé stays the single source of truth.
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS resume_sections jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS resume_style jsonb;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS updated_at timestamptz;
