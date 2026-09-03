-- Consistency fix (Phase 43/44, direct user decision): a job used to be
-- hard-hidden on a SINGLE D/F Legitimacy grade (lib/inngest/functions.ts).
-- The 2026-09-01 one-time backfill (20260901142854_backfill-legitimacy-hide-
-- reset.sql) already proved that single grade can be wrong — two real,
-- verified-genuine jobs were hidden purely because Adzuna's short preview
-- snippet momentarily read as suspicious. That migration fixed the prompt
-- and reset the data once; this migration makes "one bad grade is not
-- enough" a standing rule going forward, not a one-off repair.
--
-- New state machine, tracked per job:
--   legitimacy_fail_count = 0, is_hidden = false  -> normal.
--   legitimacy_fail_count = 1, is_hidden = false  -> "on probation": one D/F
--     grade recorded, still shown, awaiting a second, independent grade
--     before it's treated as confirmed.
--   legitimacy_fail_count = 2, is_hidden = true   -> confirmed: two
--     consecutive D/F grades, hard-hidden.
-- lib/inngest/functions.ts's persist-chunk step now only ever writes
-- fail_count 0 or 1 on a job's FIRST-ever evaluation (never hides on it);
-- the new legitimacyRecheckAsync cron is the only code path that can either
-- advance a job to fail_count=2/hidden, or clear a probation flag back to 0.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS legitimacy_fail_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS legitimacy_checked_at timestamptz;

-- Backfill: jobs already hard-hidden under the OLD single-strike rule need
-- to enter the new state machine at fail_count=1 (one real strike already on
-- record), not 0 or 2 — fail_count=1 makes them eligible for the SAME
-- periodic recheck query as newly-flagged probation jobs, giving every
-- already-hidden AI judgment call a real, ongoing second look instead of
-- staying hidden forever on a single grade (the 2026-09-01 migration only
-- ever fixed this once, for jobs existing at that moment).
-- "is_hidden=true AND match_score IS NOT NULL" is the same signature that
-- migration already established for "hidden by AI legitimacy judgment, not
-- the separate Phase 2 pre-filter or an explicit user action" — pre-filtered
-- jobs are excluded from evaluation entirely so always have match_score
-- NULL, and this never touches a user's own hide action either.
UPDATE public.jobs
SET legitimacy_fail_count = 1, legitimacy_checked_at = now()
WHERE is_hidden = true AND match_score IS NOT NULL AND legitimacy_fail_count = 0;

-- Powers legitimacyRecheckAsync's oldest-checked-first batch selection —
-- same posture as ats_registry's own last_crawled_at index, a partial index
-- since only fail_count=1 rows are ever candidates for this query.
CREATE INDEX IF NOT EXISTS jobs_legitimacy_recheck_idx ON public.jobs (legitimacy_checked_at) WHERE legitimacy_fail_count = 1;
