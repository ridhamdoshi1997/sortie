-- Bait-and-Switch Risk Scorer — rides on the existing evaluator call (the
-- model already reads title/seniorityLevel/responsibilities/requirements),
-- zero marginal AI cost. Distinct from the existing Legitimacy dimension:
-- Legitimacy asks "is this a real job," this asks "does the advertised
-- level match the actual described work."
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS title_scope_mismatch jsonb;
