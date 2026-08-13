-- Gives uploaded résumé slots (the `resumes` table) the same editing
-- workspace (Editor/Style tabs, per-bullet AI rewrite, ATS score) that
-- tailored per-job résumés already have via applications.resume_sections/
-- resume_style. Independent snapshot, same precedent as the tailored
-- résumé: editing this never touches resumes.extracted_data, which stays
-- the raw extraction used for profile sync. A dedicated
-- sections_updated_at, not the row's own `updated_at` (already used by
-- rename/setPrimary), so a section save doesn't get confused with those.
ALTER TABLE resumes
  ADD COLUMN IF NOT EXISTS sections jsonb,
  ADD COLUMN IF NOT EXISTS style jsonb,
  ADD COLUMN IF NOT EXISTS sections_updated_at timestamptz;
