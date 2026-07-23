-- profiles.email is declared on the Profile type and read in a dozen call
-- sites (admin/provider resolution, usage metering, resume/cover-letter PDF
-- contact info, the profile edit form) but the column never actually
-- existed on the live table. Every one of those reads silently returned
-- undefined instead of erroring (select("*") doesn't fail on a missing
-- column), except app/api/agent/research/route.ts, which explicitly names
-- "email" in its select and crashed with 42703 ("column profiles.email does
-- not exist").
--
-- Worse than the crash: isAdminUser(email) returns false for a falsy email,
-- so every resolveProvider(...)/checkAndConsumeUsage(...) call site that
-- reads profile.email (instead of the auth-session user.email) silently
-- forced the admin account onto Gemini and full rate limits, with no error
-- to notice it by.

ALTER TABLE public.profiles
  ADD COLUMN email text;

-- Extend the same auto-provisioning trigger from
-- 20260721040000_auto-provision-profiles.sql so new signups get email set
-- at insert time, not just backfilled once.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS 'BEGIN INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT (id) DO NOTHING; RETURN NEW; END;';

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;
