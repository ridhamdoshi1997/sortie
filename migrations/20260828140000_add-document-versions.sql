-- Résumé/cover-letter version manager (direct user report: "we don't have
-- version manager for AI generated resumes and cover letter for the same
-- job"). Confirmed real: /api/documents/generate's persistGeneratedDocument
-- (lib/documentPersistence.ts) removes+overwrites the SAME storage path and
-- the SAME applications.resume_sections/resume_pdf_url row on every
-- "Regenerate" click -- every prior AI-generated draft was destroyed with
-- no way back. This table is the append-only history: one row per PAST
-- version, archived right before it gets overwritten by a new generation
-- or a restore. `applications` stays the single source of truth for the
-- CURRENT document (zero change to any existing reader of that table) --
-- this is purely additive history alongside it.
CREATE TABLE public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('resume', 'cover_letter')),
  storage_path TEXT NOT NULL,
  content_text TEXT,
  resume_sections JSONB,
  resume_style JSONB,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_versions_user_job_kind
  ON public.document_versions (user_id, job_id, kind, created_at DESC);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_versions_select_own" ON public.document_versions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "document_versions_insert_own" ON public.document_versions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- No UPDATE policy -- append-only history, a version snapshot is never
-- edited in place once archived. DELETE is allowed so a user can declutter
-- old versions they don't want kept.
CREATE POLICY "document_versions_delete_own" ON public.document_versions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.document_versions TO authenticated;
