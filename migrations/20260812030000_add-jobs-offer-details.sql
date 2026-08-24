-- Equity & Cap Table Decoder — pure calculator on user-entered offer
-- numbers (base/equity/vesting/strike), no funding-data lookup. Mirrors the
-- rejection_diagnosis/strategic_moat column shape from earlier this phase.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS offer_details jsonb,
  ADD COLUMN IF NOT EXISTS offer_details_updated_at timestamptz;
