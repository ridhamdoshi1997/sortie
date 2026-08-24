-- Phase 18 item 5: Signal-based outreach automation. No paid Clay/Apollo
-- account can be created by an agent — this table is the same
-- "wired-but-inert-until-a-real-key-exists" scaffold this project already
-- used for Sentry/Resend (see context/RESUME.md). Singleton row (id always
-- 1), same shape as app_settings. The free half of this feature (real
-- in-app job-posting-velocity signals) needs no new schema — it aggregates
-- the existing jobs table directly.
CREATE TABLE public.outreach_signal_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enrichment_provider TEXT CHECK (enrichment_provider IN ('clay', 'apollo')),
  enrichment_api_key_set BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL
);

INSERT INTO public.outreach_signal_settings (id) VALUES (1);

-- Same lockdown as app_settings/admin_notes — RLS enabled, zero policies,
-- service-role admin client only. The real API key itself is never stored
-- in this table (or any DB table) — it goes in a server-only env var
-- (ENRICHMENT_API_KEY) exactly like OPENAI_API_KEY/RESEND_API_KEY; this row
-- only tracks whether one has been configured, so the UI can show real
-- status without ever handling the secret value itself.
ALTER TABLE public.outreach_signal_settings ENABLE ROW LEVEL SECURITY;
