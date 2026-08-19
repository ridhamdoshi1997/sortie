-- Negotiation scripts (build-plan.md §F, Phase 12) — reuses jobs.leverage_synthesis's
-- already-derived talking points rather than re-deriving leverage from
-- scratch. Same shape as leverage_synthesis: persisted jsonb on the job row,
-- generated on demand, gated to application_status = 'offered'.
ALTER TABLE public.jobs ADD COLUMN negotiation_script JSONB;
