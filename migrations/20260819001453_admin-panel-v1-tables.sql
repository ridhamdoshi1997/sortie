-- Internal Admin Panel v1 (build-plan.md §R). Multi-admin + audit log kept
-- deliberately (a standing user decision overriding agy's own leaner
-- suggestion to cut both) — this needs to work for someone else running it
-- while the founder is away, and multi-person access without an audit
-- trail is a real accountability gap. Route-module splitting, admin_notes,
-- custom_usage_multiplier, and feature_flags are deferred to a later slice
-- (agy's v1-scope advice, kept) — this migration only ships what the first
-- real use case (see a runaway AI-usage abuser, suspend them) needs.

CREATE TABLE public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'support_readonly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX admin_users_user_id_idx ON public.admin_users(user_id);

-- RLS enabled, deliberately zero policies for anon/authenticated — this
-- table decides who gets into /admin, so it can never be self-servable
-- through the normal cookie-authenticated client. Only the service-role
-- admin client (createAdminClient, runs as project_admin, bypasses RLS as
-- the table owner) can read or write it.
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_table TEXT,
  target_id UUID,
  before JSONB,
  after JSONB,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_log_admin_user_id_idx ON public.admin_audit_log(admin_user_id);
CREATE INDEX admin_audit_log_target_user_id_idx ON public.admin_audit_log(target_user_id);
CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log(created_at DESC);

-- Same reasoning as admin_users — service-role client only. The whole
-- point of an audit log is that even another admin can't quietly edit or
-- delete their own trail through the normal app connection.
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- The actual v1 intervention lever. No column-level GRANT/REVOKE needed —
-- InsForge's default broad UPDATE grant to `authenticated` would otherwise
-- let a user flip this back to false on themselves via a raw SDK call
-- (profiles_update_own's policy only checks auth.uid() = id, it has no
-- concept of "which columns"), so it's guarded by a BEFORE UPDATE trigger
-- instead, per this project's access-control guide's "protected status
-- field" pattern — robust against every write path, not just the app's own
-- UI, and doesn't require enumerating every other legitimate profile
-- column to avoid breaking normal profile edits.
ALTER TABLE public.profiles ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.prevent_profiles_admin_field_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'project_admin' AND NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
    RAISE EXCEPTION 'is_suspended can only be changed by an admin';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_profiles_admin_field_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profiles_admin_field_change();
