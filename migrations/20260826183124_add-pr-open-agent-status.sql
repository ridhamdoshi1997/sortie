-- Phase 3 of the approved feedback-system plan (automation pipeline) —
-- the daily agent sets agent_status = 'pr_open' once it's opened a real
-- PR for a ticket, distinct from 'ai_done' which stays a human-only value
-- set after the PR is actually reviewed and merged. The pipeline never
-- sets 'ai_done' itself — see the plan's own "PR-gated, not auto-merge"
-- reasoning.

ALTER TABLE public.support_tickets
  DROP CONSTRAINT support_tickets_agent_status_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_agent_status_check
    CHECK (agent_status IN ('none', 'ready_for_ai', 'ai_in_progress', 'pr_open', 'ai_done'));
