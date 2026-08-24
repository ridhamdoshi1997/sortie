-- Strategic Moat Briefing — recent news/strategic-priorities lens on the
-- company, distinct from the existing culture/tech-stack company research
-- dossier. Mirrors the rejection_diagnosis/rejection_diagnosed_at column
-- shape from earlier this session.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS strategic_moat jsonb,
  ADD COLUMN IF NOT EXISTS strategic_moat_researched_at timestamptz;
