-- One-time data repair (2026-09-01, direct user request) — several buggy
-- iterations of today's lite-evaluation Legitimacy prompt (see
-- lib/evaluator.ts's LITE_SYSTEM_PROMPT) graded short-but-real job
-- descriptions (a data-source limitation of Adzuna's API, which only
-- returns a ~500-char preview snippet, not a scam signal) as D/F
-- Legitimacy, hard-hiding genuinely real postings — confirmed live via two
-- jobs with verified genuine Greenhouse/iCIMS links that were still hidden
-- purely on Legitimacy grade. The prompt is fixed (explicit rule: a short
-- snippet is not itself a red flag), but is_hidden only ever gets SET to
-- true, never automatically un-set, so already-hidden jobs stay hidden
-- forever regardless of the prompt fix.
--
-- Resets ONLY jobs that were hidden BY AI JUDGMENT (is_hidden=true AND a
-- real match_score already exists) — never touches jobs hidden by the
-- separate, unrelated Phase 2 pre-filter (staffing agencies, near-empty
-- descriptions, spam, >60-day-stale postings — those always have
-- match_score IS NULL, since they're excluded from evaluation entirely,
-- so this WHERE clause can't touch them) or by an explicit user action.
-- Clearing match_score (not just is_hidden) is deliberate: it puts these
-- jobs back into evaluateWithinQuota's "needs evaluation" set
-- (lib/actions/scraper.actions.ts), so the next search that finds them
-- re-runs the FIXED lite pass instead of leaving the old, wrong verdict in
-- place.
UPDATE public.jobs
SET
  is_hidden = false,
  match_score = NULL,
  overall_grade = NULL,
  recommendation_score = NULL,
  matched_skills = '{}',
  missing_skills = '{}',
  match_reason = NULL
WHERE is_hidden = true AND match_score IS NOT NULL;
