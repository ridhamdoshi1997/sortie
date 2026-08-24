-- The Interrogation Plan — questions the CANDIDATE should ask, synthesized
-- from strategic_moat.smartQuestions + interview_panel_members' researched
-- backgrounds. No new external research pipeline; mirrors the
-- strategic_moat/strategic_moat_researched_at column shape.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS interrogation_plan jsonb,
  ADD COLUMN IF NOT EXISTS interrogation_plan_generated_at timestamptz;
