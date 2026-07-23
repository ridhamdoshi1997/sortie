-- jobs.external_id had a GLOBAL unique constraint, but every other table in
-- this app (profiles, applications, agent_runs) scopes ownership per user
-- under RLS. The mismatch broke multi-tenancy: when two different accounts'
-- searches surface the same real job posting (identical SerpApi external_id
-- — expected once more than one account is running real Toronto/tech
-- searches), the scraper's upsert(..., { onConflict: 'external_id' }) tries
-- to UPDATE a row owned by the OTHER user. RLS blocks that update, and
-- lib/actions/scraper.actions.ts's ON CONFLICT batch silently returns zero
-- rows for the whole search — "Insforge upsert did not return any saved
-- jobs," failing every job the searching user's account had nothing to do
-- with. Found live: account 9e25bf40... already had 26 jobs saved: a later
-- search under the admin account (69c8c225...) for the same city/title
-- immediately failed.
--
-- Fix: scope the uniqueness to (user_id, external_id) so each account dedupes
-- independently, matching this app's actual multi-tenant model. The app code
-- change (lib/actions/scraper.actions.ts's onConflict target) ships with
-- this migration.

ALTER TABLE public.jobs
  DROP CONSTRAINT jobs_external_id_key;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_user_external_id_key UNIQUE (user_id, external_id);
