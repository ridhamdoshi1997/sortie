-- An admin-controllable pause for the background crawl crons, alongside the
-- existing CRAWL_PAUSED env var rather than replacing it.
--
-- Why both, and why the env var stays primary: lib/crawlPause.ts was written
-- as an env var on purpose, and that reasoning still holds — "the thing being
-- switched off is the database, so a flag stored there could not be read at
-- exactly the moment it is needed most." During the 2026-09-08 outage the
-- database was too slow to answer anything, so a DB-backed switch would have
-- been unreadable precisely when it mattered.
--
-- So the two have different jobs:
--   * CRAWL_PAUSED (env)  — the EMERGENCY kill switch. Survives a dying
--     database, needs a redeploy to change, and always wins.
--   * crawl_paused (here) — the ORDINARY pause an admin flips from the
--     System Health page to stop crawls while investigating something,
--     without a redeploy. Read with a short timeout, and a failed read
--     degrades to the env var rather than to "paused", because if this read
--     fails the cron was going to fail on its real work anyway.
--
-- Reuses app_settings (already the singleton row behind the AI kill switch)
-- rather than adding a second settings table.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS crawl_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS crawl_paused_reason text,
  ADD COLUMN IF NOT EXISTS crawl_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS crawl_paused_by uuid;

COMMENT ON COLUMN public.app_settings.crawl_paused IS
  'Admin-flipped soft pause for the crawl crons. The CRAWL_PAUSED env var is the emergency override and always wins.';
