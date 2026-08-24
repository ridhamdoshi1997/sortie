-- Phase 18 item 1: Programmatic SEO/GEO content engine. Marks which pages
-- came from the new Inngest-cron-triggered Gemini drafting pipeline vs a
-- human-authored page, so the /admin/content queue can badge them for
-- review. Reuses the existing pages table (draft/published + meta fields
-- already fit this exactly) rather than a new table.
ALTER TABLE public.pages ADD COLUMN content_source TEXT NOT NULL DEFAULT 'manual' CHECK (content_source IN ('manual', 'ai_geo'));

CREATE INDEX pages_content_source_idx ON public.pages(content_source);
