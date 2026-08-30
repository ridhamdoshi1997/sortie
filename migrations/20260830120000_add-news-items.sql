-- News section (build-plan.md — "Career Radar" / /news, direct user request
-- 2026-08-30). Cross-industry, category-tabbed news (Hiring & Layoffs, AI &
-- Future of Work for v1), ingested from free RSS feeds and synthesized via
-- Gemini into a "career impact" line. Read via the admin client only, same
-- precedent as lib/interviewSeo.ts/lib/salaryInsightsSeo.ts — no RLS SELECT
-- policy needed since /news and the CareerRadar widget both go through
-- server-side admin reads, never a direct client query. Writes only ever
-- happen from the Inngest ingestion cron (also admin client) — RLS enabled,
-- zero client policies, same default-deny pattern as every internal/admin
-- table in this app (admin_users, ai_cost_rates, etc.).
CREATE TABLE IF NOT EXISTS public.news_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  company_name text,
  title text NOT NULL,
  source_url text NOT NULL UNIQUE,
  source_name text,
  ai_summary text NOT NULL,
  ai_career_impact text NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS news_items_category_published_idx
  ON public.news_items (category, published_at DESC);

CREATE INDEX IF NOT EXISTS news_items_company_name_idx
  ON public.news_items (company_name)
  WHERE company_name IS NOT NULL;

ALTER TABLE public.news_items ENABLE ROW LEVEL SECURITY;
