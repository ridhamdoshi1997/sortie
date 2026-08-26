-- Feedback / bug-report system (Phase 1 of the approved plan) — extends the
-- existing support_tickets/support_ticket_messages tables (migration
-- 20260819090000_support-tickets-tables.sql) rather than building a
-- parallel system. category defaults to 'support' and agent_status to
-- 'none' so every existing row and the plain "Contact support" flow keep
-- working unchanged.
--
-- agent_status is deliberately orthogonal to the existing human `status`
-- (open/pending/resolved) — ops triage (open/pending/resolved) and the
-- AI-pickup lifecycle (none/ready_for_ai/ai_in_progress/ai_done) are two
-- independent axes on the same ticket, not one merged enum.

ALTER TABLE public.support_tickets
  ADD COLUMN category TEXT NOT NULL DEFAULT 'support'
    CHECK (category IN ('bug', 'feature_request', 'change_request', 'feedback', 'support')),
  ADD COLUMN agent_status TEXT NOT NULL DEFAULT 'none'
    CHECK (agent_status IN ('none', 'ready_for_ai', 'ai_in_progress', 'ai_done')),
  ADD COLUMN ops_note TEXT,
  ADD COLUMN page_url TEXT,
  ADD COLUMN user_agent TEXT;

CREATE INDEX support_tickets_category_idx ON public.support_tickets(category);
CREATE INDEX support_tickets_agent_status_idx ON public.support_tickets(agent_status)
  WHERE agent_status <> 'none';

-- Screenshots attach per-message (not per-ticket) so both the initial
-- report and any follow-up reply can carry images. Array column, matching
-- this app's own established convention for small per-row lists (e.g.
-- jobs.tags) rather than a join table for what's always a handful of URLs.
ALTER TABLE public.support_ticket_messages
  ADD COLUMN image_urls TEXT[] NOT NULL DEFAULT '{}';

-- Beta-tester flag — admin-settable per user (UsersTable.tsx bulk action +
-- UserDetailView.tsx single toggle, per the approved plan). Owners/admins
-- already qualify for the feedback entry point via their admin_users role
-- and don't need this flag set; it's for opting specific real users in
-- ahead of the eventual full rollout.
ALTER TABLE public.profiles
  ADD COLUMN is_tester BOOLEAN NOT NULL DEFAULT false;
