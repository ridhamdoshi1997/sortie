-- Admin console expansion, item 5 (context/RESUME.md): Marketing
-- (/admin/marketing). CAN-SPAM is non-negotiable regardless of scale —
-- see actions/adminMarketing.ts's sendBroadcast() for the real compliance
-- gate (refuses to send without a configured physical mailing address,
-- not just a cosmetic placeholder).

ALTER TABLE public.profiles ADD COLUMN marketing_opt_out BOOLEAN NOT NULL DEFAULT false;

-- A real stored per-user token, not a stateless signed one — matches this
-- project's own established pattern (user_api_keys' hashed-random-token
-- lookup) over a JWT-style crypto shortcut. Only ever read via the
-- service-role client (embedding it in an outgoing broadcast, and
-- resolving it on the unauthenticated GET /api/unsubscribe route) — no
-- RLS policy needed, nothing in-app reads this for a signed-in user.
ALTER TABLE public.profiles ADD COLUMN unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE TABLE public.marketing_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('draft', 'sending', 'sent', 'failed')) DEFAULT 'draft',
  recipient_count INTEGER,
  sent_count INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same lockdown as every other admin-owned table this session — RLS
-- enabled, zero policies, service-role admin client only.
ALTER TABLE public.marketing_broadcasts ENABLE ROW LEVEL SECURITY;
