-- Phase 18 item 2: "Success Story" content repurposing pipeline. Triggered
-- when a real user milestone lands (jobs.application_status -> 'offered'),
-- an Inngest function drafts an anonymized 3-part thread/LinkedIn post via
-- Gemini into this approval inbox, surfaced as a new tab on
-- /admin/marketing. user_id is kept for internal dedup/audit only — never
-- rendered to any public surface, and the draft content itself must never
-- include the user's real name/company (enforced in the generation prompt,
-- lib/admin/socialDrafts.ts).
CREATE TABLE public.social_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('application_offer', 'compensation_event')),
  source_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  headline TEXT NOT NULL,
  thread_markdown TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_review', 'approved', 'rejected', 'posted')) DEFAULT 'pending_review',
  reviewed_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One draft per triggering event — a milestone can only ever spawn one
  -- generation, re-runs (retries, re-processed events) must not duplicate.
  UNIQUE (source_type, source_id)
);

CREATE INDEX social_drafts_status_idx ON public.social_drafts(status);
CREATE INDEX social_drafts_user_id_idx ON public.social_drafts(user_id);

-- Same lockdown as every other admin-owned table this stretch — RLS
-- enabled, zero policies, service-role admin client only. A user must never
-- be able to read a draft written about their own journey.
ALTER TABLE public.social_drafts ENABLE ROW LEVEL SECURITY;
