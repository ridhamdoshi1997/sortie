-- Post-Offer Leverage Synthesizer — same honesty-scoped shape as
-- rejection_diagnosis (lib/rejectionIntelligence.ts): grounded only in real
-- known data already stored on this job, never fabricated benchmarks.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS leverage_synthesis jsonb,
  ADD COLUMN IF NOT EXISTS leverage_synthesized_at timestamptz;
