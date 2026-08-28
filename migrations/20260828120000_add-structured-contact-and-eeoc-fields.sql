-- Split contact fields (build-plan.md's "Profile field granularity" gap,
-- Teardown) -- Workday/Greenhouse/Lever application forms all ask for name
-- parts, phone type/country code, and a structured address separately, not
-- one full_name/phone/location string each. Additive only: full_name/phone/
-- location stay exactly as they are (every existing consumer -- resume PDF,
-- DOCX export, onboarding, cover letters -- keeps reading them unchanged);
-- these are new, optional, autofill-shaped fields alongside them, a real
-- prerequisite for any future ATS-autofill feature rather than a rewrite of
-- what's already working.
ALTER TABLE public.profiles ADD COLUMN first_name TEXT;
ALTER TABLE public.profiles ADD COLUMN middle_name TEXT;
ALTER TABLE public.profiles ADD COLUMN last_name TEXT;
ALTER TABLE public.profiles ADD COLUMN phone_type TEXT;
ALTER TABLE public.profiles ADD COLUMN phone_country_code TEXT;
ALTER TABLE public.profiles ADD COLUMN address_line TEXT;
ALTER TABLE public.profiles ADD COLUMN address_city TEXT;
ALTER TABLE public.profiles ADD COLUMN address_state_province TEXT;
ALTER TABLE public.profiles ADD COLUMN address_country_region TEXT;

-- Equal Employment Opportunity / voluntary self-identification (build-plan.md
-- Teardown row) -- the standard EEOC fields many US ATS applications
-- request (race/ethnicity, gender, veteran status, disability status).
-- Genuinely sensitive data: every column here is nullable with no default,
-- never read by any AI prompt, resume/cover-letter generator, or export --
-- purely stored for a future opt-in autofill feature. eeoc_consented_at is
-- the actual gate: the profile UI must only let these fields be edited after
-- an explicit, separate consent action sets this timestamp, never bundled
-- into the general "save profile" flow's implicit consent.
ALTER TABLE public.profiles ADD COLUMN eeoc_race_ethnicity TEXT;
ALTER TABLE public.profiles ADD COLUMN eeoc_gender TEXT;
ALTER TABLE public.profiles ADD COLUMN eeoc_veteran_status TEXT;
ALTER TABLE public.profiles ADD COLUMN eeoc_disability_status TEXT;
ALTER TABLE public.profiles ADD COLUMN eeoc_consented_at TIMESTAMPTZ;
