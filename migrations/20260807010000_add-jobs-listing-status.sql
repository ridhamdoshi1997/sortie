-- Detecting a posting that's gone stale/unavailable, two signals:
-- `marked_unavailable_at` — user-confirmed via a manual action (zero false
-- positives). `dropped_from_search_at` — set automatically when a job that
-- was previously returned by an exact repeat of the same (title, location)
-- search is no longer in the newest run's results (lib/actions/scraper.actions.ts,
-- keyed off the existing agent_runs/jobs.run_id linkage — no new scraping,
-- just comparing what SerpApi already returned across two runs). Both null
-- means "no signal yet," not "confirmed still active" — this app has no way
-- to positively confirm a listing is live, only ways to notice it's gone.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS marked_unavailable_at timestamptz;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS dropped_from_search_at timestamptz;
