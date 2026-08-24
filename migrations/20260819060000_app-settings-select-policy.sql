-- Captures a real RLS policy that already exists live but was only ever
-- applied via `db query` during Admin Panel v1.1 (2026-08-19), never
-- committed to a migration file — a real gap found during a full-session
-- regression audit. app_settings otherwise follows the same "zero
-- policies for anon/authenticated" lockdown as admin_users/admin_notes,
-- but the AI kill switch it holds needs to be readable by every normal
-- user's own cookie-authenticated client (lib/usage.ts's
-- checkAndConsumeUsage runs there, not on the service-role client) — so
-- it gets one narrow read-only policy instead. Writable only by the
-- service-role client (project_admin, bypasses RLS as table owner).
--
-- DROP IF EXISTS first since this policy is already live on both dev and
-- production (same shared backend) — this migration is catching up
-- version control to match real state, not creating something new.
DROP POLICY IF EXISTS app_settings_select_all ON public.app_settings;

CREATE POLICY app_settings_select_all
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);
