-- Trap Door Predictor — likely tough/uncomfortable interview questions
-- grounded in this job's own stored risk signals (company_research culture
-- notes, strategic_moat existential threats, title_scope_mismatch), distinct
-- from company_research's generic interviewPrep list. Mirrors the
-- strategic_moat/strategic_moat_researched_at column shape.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS trap_door_predictions jsonb,
  ADD COLUMN IF NOT EXISTS trap_door_predicted_at timestamptz;
