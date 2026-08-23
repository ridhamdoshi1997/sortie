-- Inbox/Pipeline split (direct user request, `agy`-researched — see
-- context/RESUME.md's "draft logic" entry). Real bug this fixes at the
-- data-model level, on top of the earlier stale-listing filter fix: the
-- dashboard Pipeline Funnel and AI Pipeline Strategy Read were counting
-- every found-but-never-reviewed job as active pipeline backlog, because
-- "draft" was doing double duty as both "just found, not yet looked at"
-- AND "the first real Kanban stage." Splits that into two real statuses:
--
-- - "inbox" — the new jobs.application_status DEFAULT. Pre-pipeline,
--   deliberately excluded from the Kanban board (STAGE_ORDER in
--   lib/applicationStatus.ts) and from every "active pipeline" computation
--   (lib/pipelineStrategy.ts, app/dashboard/page.tsx's funnelCounts).
--   Reviewed instead from a dedicated dense-table Inbox view
--   (components/missions/InboxTable.tsx), with a real 14-day untouched-TTL
--   auto-archive (lib/inngest/functions.ts's archiveStaleInboxJobsAsync).
-- - "shortlisted" — the real first Kanban stage. A job the user has
--   explicitly decided to pursue, either from the Inbox view's own
--   "Shortlist" action or directly from a job's detail page.
--
-- Widen the constraint first to the UNION of old and new values — a plain
-- CHECK add validates against every existing row immediately, and rows
-- still carry 'draft' until the backfill below runs, so the constraint
-- can't drop 'draft' yet or this step itself fails.
ALTER TABLE jobs DROP CONSTRAINT jobs_application_status_check;
ALTER TABLE jobs
  ADD CONSTRAINT jobs_application_status_check
  CHECK (application_status IN ('draft', 'inbox', 'shortlisted', 'applied', 'interviewing', 'offered', 'rejected'));

-- Backfill (direct user decision, since none of these ~973+ existing jobs
-- across real accounts were ever explicitly triaged into a pipeline stage
-- to begin with — every one of them is, definitionally, exactly what
-- "inbox" now means): every existing 'draft' job becomes 'inbox'.
UPDATE jobs SET application_status = 'inbox' WHERE application_status = 'draft';

-- Now that no row is 'draft' anymore, tighten the constraint to its real
-- final set.
ALTER TABLE jobs DROP CONSTRAINT jobs_application_status_check;
ALTER TABLE jobs
  ADD CONSTRAINT jobs_application_status_check
  CHECK (application_status IN ('inbox', 'shortlisted', 'applied', 'interviewing', 'offered', 'rejected'));

ALTER TABLE jobs ALTER COLUMN application_status SET DEFAULT 'inbox';
