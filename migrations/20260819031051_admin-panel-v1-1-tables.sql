-- Admin Panel v1.1 (build-plan.md §R fast-follows, deferred from v1 per
-- agy's build-order advice — additive, not a rewrite). admin_notes,
-- the global AI kill switch, and the two deferred per-user intervention
-- levers (custom_usage_multiplier, feature_flags).

CREATE TABLE public.admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_notes_user_id_idx ON public.admin_notes(user_id);

-- Same RLS shape as admin_users/admin_audit_log — zero policies for
-- anon/authenticated, service-role client only. A user should never be
-- able to read admin notes written about them.
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- Singleton table (id always 1) for the global AI kill switch — a real
-- operational lever for a runaway bug or bot-spam scenario, not just
-- per-user suspension. Checked in lib/usage.ts's checkAndConsumeUsage,
-- same choke point as is_suspended, BEFORE it — a global outage is the
-- most totalizing condition, checked first.
CREATE TABLE public.app_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ai_enabled BOOLEAN NOT NULL DEFAULT true,
  ai_disabled_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.admin_users(id)
);

INSERT INTO public.app_settings (id, ai_enabled) VALUES (1, true);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- The two deferred per-user intervention levers from the original §R spec.
-- custom_usage_multiplier scales lib/usage.ts's DAILY_LIMITS for one user
-- (e.g. temporarily raise a legitimate power user's cap, or dial an abuser
-- down to a fraction instead of a full suspend). feature_flags is a plain
-- jsonb per-user experimental-feature toggle map, read by app code
-- wherever a flag gate is needed later — no specific flag defined yet.
ALTER TABLE public.profiles ADD COLUMN custom_usage_multiplier NUMERIC NOT NULL DEFAULT 1;
ALTER TABLE public.profiles ADD COLUMN feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Same protected-status-field pattern as is_suspended's trigger
-- (20260819001453_admin-panel-v1-tables.sql) — extended to cover these two
-- new columns too, rather than a second separate trigger.
CREATE OR REPLACE FUNCTION public.prevent_profiles_admin_field_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'project_admin' THEN
    IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
      RAISE EXCEPTION 'is_suspended can only be changed by an admin';
    END IF;
    IF NEW.custom_usage_multiplier IS DISTINCT FROM OLD.custom_usage_multiplier THEN
      RAISE EXCEPTION 'custom_usage_multiplier can only be changed by an admin';
    END IF;
    IF NEW.feature_flags IS DISTINCT FROM OLD.feature_flags THEN
      RAISE EXCEPTION 'feature_flags can only be changed by an admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- CREATE OR REPLACE on the existing trigger FUNCTION is enough — the
-- CREATE TRIGGER itself (bound to profiles, pointing at this function)
-- already exists from the earlier migration and doesn't need recreating.
