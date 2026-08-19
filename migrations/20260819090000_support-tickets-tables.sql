-- Admin console expansion, item 4 (context/RESUME.md): Support
-- (/admin/support inbox + a real user-facing /settings submission point).
-- A real child table for messages, not a JSONB array — matches this app's
-- own established pattern (admin_notes, admin_audit_log).
--
-- Unlike every other admin_* table added this session (admin_users,
-- business_expenses, ai_cost_rates, pages — all RLS-enabled with ZERO
-- policies, service-role client only), these two tables need real RLS:
-- a normal user creates and reads their OWN tickets/messages through the
-- regular cookie-authenticated client, while /admin/support reads
-- everything through the service-role client (which bypasses RLS
-- entirely, same as the rest of /admin).
--
-- support_ticket_messages carries a denormalized `user_id` (copied from
-- its parent ticket at insert time) specifically so its own RLS policy is
-- a direct `auth.uid() = user_id` check — no cross-table subquery against
-- another RLS-enabled table, avoiding the recursion/complexity that would
-- otherwise call for a SECURITY DEFINER helper function.

CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'pending', 'resolved')) DEFAULT 'open',
  assigned_admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_user_id_idx ON public.support_tickets(user_id);
CREATE INDEX support_tickets_status_idx ON public.support_tickets(status);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_select_own ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY support_tickets_insert_own ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- No user UPDATE/DELETE policy — status/assignment changes are an admin
-- action only, applied through the service-role client from
-- /admin/support (which bypasses RLS, same as every other admin write).

-- author_admin_id is set only when author_type = 'admin'; author_type =
-- 'user' messages are always authored by support_tickets.user_id itself
-- (this table's own user_id column), so there's no separate
-- author_user_id needed.
CREATE TABLE public.support_ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('user', 'admin')),
  author_admin_id UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_messages_ticket_id_idx ON public.support_ticket_messages(ticket_id);

ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_ticket_messages_select_own ON public.support_ticket_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY support_ticket_messages_insert_own ON public.support_ticket_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id AND author_type = 'user');
