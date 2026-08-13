-- Cached AI Question Bank (build-plan.md §N, Phase 1: Reconnaissance) — the
-- first genuinely shared, non-user-owned table in this schema. Keyed on
-- (company, role_family, seniority), NOT per-job or per-user: the same
-- generated bank is reused across every user/posting that matches the same
-- combination, same "generate once, persist, reuse" shape already used for
-- company research dossiers, just shared across users instead of scoped to
-- one job row. cache_key is a normalized (lowercase, trimmed) composite so
-- lookups are exact-match rather than fuzzy — normalization happens in
-- application code, not here.
CREATE TABLE public.interview_question_banks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key     text        NOT NULL UNIQUE,
  company       text        NOT NULL,
  role_family   text        NOT NULL,
  seniority     text        NOT NULL,
  questions     jsonb       NOT NULL,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.interview_question_banks ENABLE ROW LEVEL SECURITY;

-- Shared reference data, not personal — any authenticated user can read any
-- entry. No per-row ownership concept exists here, unlike every other table
-- in this schema.
CREATE POLICY "interview_question_banks_select_all"
  ON public.interview_question_banks FOR SELECT
  TO authenticated
  USING (true);

-- Any authenticated user can populate a cache miss (first person to ask
-- about a given company/role/seniority combo generates it for everyone
-- after them) — same trust level as SELECT, not a privileged write.
CREATE POLICY "interview_question_banks_insert_any"
  ON public.interview_question_banks FOR INSERT
  TO authenticated
  WITH CHECK (true);
