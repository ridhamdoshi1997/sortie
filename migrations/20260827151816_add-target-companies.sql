-- Phase 8 "Portal Scanner" (build-plan.md §24) -- a user-curated watchlist
-- of companies to scan directly via their own ATS's public job-board API
-- (Greenhouse/Lever/Ashby), instead of only whatever Google Jobs/SerpApi
-- happens to surface. Starts empty per the plan's own decision -- no
-- pre-seeded list, the user adds companies through the UI as they go.
CREATE TABLE public.target_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  ats_platform TEXT NOT NULL CHECK (ats_platform IN ('greenhouse', 'lever', 'ashby')),
  company_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_scanned_at TIMESTAMPTZ,
  UNIQUE (user_id, ats_platform, company_slug)
);

CREATE INDEX idx_target_companies_user_id ON public.target_companies (user_id);

ALTER TABLE public.target_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "target_companies_select_own" ON public.target_companies
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "target_companies_insert_own" ON public.target_companies
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "target_companies_update_own" ON public.target_companies
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "target_companies_delete_own" ON public.target_companies
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_companies TO authenticated;
