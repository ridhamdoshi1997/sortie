-- Global, self-building registry of which ATS each real employer uses.
--
-- Why this exists (2026-08-31): the cost-effective path to competitor-level
-- link quality is direct ATS polling — an employer's own job board is
-- ground truth (legitimate link by construction, always current) and its
-- public JSON endpoints are FREE and unlimited, unlike every paid
-- aggregator. The blocker was never the polling, it was knowing WHICH ATS
-- each company uses. lib/atsProviders.ts's discoverAtsFromDomain() solves
-- that, but re-ran discovery from scratch (up to 4 HTTP fetches) every
-- single time, and threw the answer away afterwards.
--
-- This caches that answer once, globally, so it is paid for exactly once
-- per company and then reused by every user and every future search.
-- Deliberately NOT per-user (unlike target_companies, which is a personal
-- watchlist): which ATS Shopify uses is a fact about the world, not about
-- a user.
CREATE TABLE IF NOT EXISTS ats_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Normalized lowercase/alphanumeric company key, so "TD Bank",
  -- "TD Bank!" and "td bank" collapse to one row.
  company_key text NOT NULL UNIQUE,
  company_name text NOT NULL,
  company_domain text,
  -- null platform = discovery genuinely ran and found nothing. Stored
  -- rather than left absent so we don't re-attempt a known-negative on
  -- every future search; retried occasionally via last_checked_at.
  platform text,
  -- Per-platform connection details (Workday needs tenant/instance/
  -- locale/board; the others just a slug). JSONB for the same reason
  -- subscription_plans.daily_action_limits is: the shape varies per
  -- platform and a column-per-field schema would churn constantly.
  config jsonb,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ats_registry_platform_idx ON ats_registry (platform) WHERE platform IS NOT NULL;
CREATE INDEX IF NOT EXISTS ats_registry_last_checked_idx ON ats_registry (last_checked_at);

-- Same posture as news_items / interview_question_banks: RLS on with zero
-- client policies. This is server-derived reference data — only the
-- service-role client (discovery cron, search enrichment) ever reads or
-- writes it, never a browser session.
ALTER TABLE ats_registry ENABLE ROW LEVEL SECURITY;
