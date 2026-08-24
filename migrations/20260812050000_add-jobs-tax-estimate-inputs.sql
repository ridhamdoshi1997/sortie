-- Salary Tax & Take-Home Calculator inputs (country/state-province/annual
-- gross income) — kept in its own column, separate from offer_details, so
-- the Equity Decoder tab and Tax Calculator tab can each save independently
-- without one overwriting the other's fields.
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS tax_estimate_inputs jsonb,
  ADD COLUMN IF NOT EXISTS tax_estimate_inputs_updated_at timestamptz;
