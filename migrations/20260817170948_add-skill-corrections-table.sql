-- §Q2 Correction Memory -> Adaptive Fit Scoring. Logs every skill-tag
-- correction the user already makes via correctSkillTag (Qualification.tsx),
-- keyed by role_family (lib/interviewQuestions.ts's normalizeRoleFamily) so
-- future evaluations for the same kind of role can be biased by what the
-- user has already told this app about their own skills. job_id is SET NULL
-- on delete, not CASCADE -- the whole point of this table is the memory
-- outlives any single job.
CREATE TABLE public.skill_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  role_family text NOT NULL,
  skill text NOT NULL,
  correction_type text NOT NULL CHECK (correction_type IN ('confirmed_have', 'confirmed_missing')),
  corrected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX skill_corrections_user_role_family_idx ON public.skill_corrections (user_id, role_family);

ALTER TABLE public.skill_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY skill_corrections_select_own ON public.skill_corrections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY skill_corrections_insert_own ON public.skill_corrections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY skill_corrections_delete_own ON public.skill_corrections
  FOR DELETE USING (auth.uid() = user_id);
