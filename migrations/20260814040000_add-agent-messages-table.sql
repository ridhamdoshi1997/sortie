-- Navigator (build-plan.md §O) — one persisted, ongoing conversation per user,
-- unlike the per-document AI chat's ephemeral local-only state
-- (components/documents/useDocumentChat.ts). Mirrors accomplishments'
-- per-user-owned table shape.
CREATE TABLE public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  action_payload jsonb,
  action_executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_messages_user_id_idx ON public.agent_messages (user_id, created_at);

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_messages_select_own ON public.agent_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY agent_messages_insert_own ON public.agent_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY agent_messages_update_own ON public.agent_messages
  FOR UPDATE USING (auth.uid() = user_id);
