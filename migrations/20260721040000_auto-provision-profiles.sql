-- Fixes the root cause of "profile won't save" for any account other than the
-- first: nothing in the app ever created a public.profiles row. saveProfile()
-- runs an UPDATE, which matched zero rows, so every new OAuth user hit
-- "Profile not found" and could never save, generate, or extract.
--
-- Three parts: safe column defaults, auto-provisioning trigger, and a backfill
-- for accounts created before the trigger existed.

-- 1. Defaults so no insert path can produce NULL arrays/objects. App code
--    treats these as non-nullable (e.g. profile.skills.join(...)), so a NULL
--    here is a runtime crash.
ALTER TABLE public.profiles
  ALTER COLUMN skills SET DEFAULT '{}',
  ALTER COLUMN industries SET DEFAULT '{}',
  ALTER COLUMN job_titles_seeking SET DEFAULT '{}',
  ALTER COLUMN preferred_locations SET DEFAULT '{}',
  ALTER COLUMN work_experience SET DEFAULT '[]'::jsonb,
  ALTER COLUMN education SET DEFAULT '{}'::jsonb;

-- 2. Auto-provision a profiles row whenever an auth user is created.
--    SECURITY DEFINER so it runs regardless of the inserting role; the
--    ON CONFLICT keeps it idempotent.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS 'BEGIN INSERT INTO public.profiles (id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING; RETURN NEW; END;';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Backfill accounts that already existed without a profile row, and
--    repair any NULL array/json columns on existing rows.
INSERT INTO public.profiles (id)
SELECT u.id FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

UPDATE public.profiles SET
  skills = COALESCE(skills, '{}'),
  industries = COALESCE(industries, '{}'),
  job_titles_seeking = COALESCE(job_titles_seeking, '{}'),
  preferred_locations = COALESCE(preferred_locations, '{}'),
  work_experience = COALESCE(work_experience, '[]'::jsonb),
  education = COALESCE(education, '{}'::jsonb);
