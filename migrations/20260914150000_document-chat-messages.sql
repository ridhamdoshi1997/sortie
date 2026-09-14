-- Phase 55 — résumé and cover-letter chat history that survives a refresh.
--
-- The AI Rewrite chat kept its thread in React state only, so a page refresh
-- or a switch to the Editor tab (which unmounts the panel) erased it. Worse,
-- the server relied on the CLIENT to send the conversation back each turn,
-- so a refreshed page silently revised with no memory of earlier
-- instructions. One row per message; the chat route reads the thread from
-- here and saves each exchange only after the revision itself is written.

CREATE TABLE IF NOT EXISTS public.document_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('resume', 'cover_letter')),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_chat_messages_thread_idx
  ON public.document_chat_messages (user_id, job_id, kind, created_at);

ALTER TABLE public.document_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document chat: read own" ON public.document_chat_messages;
CREATE POLICY "document chat: read own" ON public.document_chat_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- The job must be the user's own as well, so a thread cannot be attached to
-- someone else's job id.
DROP POLICY IF EXISTS "document chat: write own" ON public.document_chat_messages;
CREATE POLICY "document chat: write own" ON public.document_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "document chat: delete own" ON public.document_chat_messages;
CREATE POLICY "document chat: delete own" ON public.document_chat_messages
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- No UPDATE policy: a message, once said, is not rewritten.
--
-- Supabase's default privileges grant authenticated EVERY table privilege on
-- a new table, including TRUNCATE — which RLS does not govern at all. Revoked
-- explicitly so only what the policies describe is grantable.
REVOKE ALL ON public.document_chat_messages FROM anon;
REVOKE UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.document_chat_messages FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.document_chat_messages TO authenticated;
GRANT ALL ON public.document_chat_messages TO service_role;
