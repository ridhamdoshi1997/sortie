-- Real trust gap found live (2026-08-26 user report): scraped apply links
-- sometimes resolved to low-quality job-board mirrors or scam/SEO-farm
-- sites instead of the employer's own page (lib/applyLinkTrust.ts fixes the
-- selection logic going forward). But for jobs already scraped, there was
-- no way to retroactively pick a BETTER link, because only the single
-- chosen URL was ever persisted -- the full apply_options candidate list
-- SerpApi returned was discarded. This column stops that from ever
-- happening again: every future scrape stores the raw candidate array
-- alongside the pick, so a future classifier improvement can be reapplied
-- via a simple backfill script against data we already have, with zero new
-- API cost.
ALTER TABLE public.jobs ADD COLUMN raw_apply_options JSONB;

-- Marks when a lazy, on-demand re-resolution attempt last ran for a job
-- whose stored apply link classifies as low-quality (app/find-jobs/[id]/
-- page.tsx, fired via next/server's after() on a real page view, same
-- fire-and-forget pattern already used there for last_viewed_at). Gates
-- against re-attempting the same already-tried job on every subsequent
-- view -- a genuinely stale/expired listing won't resolve any better on a
-- second attempt, so retrying costs real SerpApi quota for nothing.
ALTER TABLE public.jobs ADD COLUMN apply_link_resolved_at TIMESTAMPTZ;
