-- The `applications` table has existed since the original schema but was
-- never used by any code path and was found with RLS disabled and zero
-- policies. Now that it's about to start holding real per-user generated
-- resumes/cover letters, both gaps must close before any writes happen.
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS resume_pdf_url text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS cover_letter_pdf_url text;

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "applications_select_own"
  ON public.applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "applications_insert_own"
  ON public.applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "applications_update_own"
  ON public.applications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "applications_delete_own"
  ON public.applications FOR DELETE
  USING (auth.uid() = user_id);
