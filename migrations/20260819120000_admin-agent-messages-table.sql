-- Admin Navigator (direct user request, explicitly separate from the
-- consumer-facing Navigator/agent_messages — different data domain: admin
-- ops data, not job-seeker data. See lib/adminAgentAssistant.ts's own
-- comment for the full reasoning against duplicating consumer Navigator.

CREATE TABLE public.admin_agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_agent_messages_admin_user_id_idx ON public.admin_agent_messages(admin_user_id);

-- Same lockdown as every other admin-owned table — RLS enabled, zero
-- policies, service-role client only (requireAdmin() gates every action
-- that touches this table, same as the rest of /admin).
ALTER TABLE public.admin_agent_messages ENABLE ROW LEVEL SECURITY;
