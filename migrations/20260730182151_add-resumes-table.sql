-- Multi-résumé slots (up to 5/user, enforced app-side — actions/resumes.ts).
-- Decoupled from `jobs` on purpose: this is the standalone résumé-workspace
-- domain from build-action-plan-2026-07-28.md Phase 1.2 ("a user should be
-- able to edit their resume from /resume, not just from a specific job"),
-- not a replacement for jobs.tailored_resume_url (per-job AI tailoring stays
-- as-is for now — merging the two is the separate document-engine
-- refactor Phase 1.2 already scopes, not done here).
CREATE TABLE public.resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  persona text,
  target_job_title text,
  storage_path text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'uploaded',
  -- Snapshot of extractProfile()'s output for this file, same shape as
  -- ExtractedProfile in actions/profile.ts. Sync-to-profile diffs against
  -- the live profiles row using this, not a re-parse on every sync click.
  extracted_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A user can have zero primary résumés (before their first upload) but never
-- more than one — real data-integrity invariant, not just a UI convention.
CREATE UNIQUE INDEX resumes_one_primary_per_user
  ON public.resumes (user_id)
  WHERE is_primary;

CREATE INDEX resumes_user_id_idx ON public.resumes (user_id);

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY resumes_select_own ON public.resumes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY resumes_insert_own ON public.resumes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY resumes_update_own ON public.resumes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY resumes_delete_own ON public.resumes
  FOR DELETE USING (auth.uid() = user_id);
