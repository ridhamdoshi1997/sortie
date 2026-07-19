-- The live `jobs` table was built through an undocumented path that
-- diverged from migrations/20260603114535_create-jobs.sql — several
-- columns that table already defines were never actually applied,
-- including one (company_research) that live code depends on, causing
-- a hard DB error ("Failed to load job") every time Company Research
-- was used. This migration reconciles the live table with the columns
-- current application code actually reads.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS company_research jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS responsibilities text[] DEFAULT '{}';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS requirements text[] DEFAULT '{}';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS nice_to_have text[] DEFAULT '{}';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS benefits text[] DEFAULT '{}';
