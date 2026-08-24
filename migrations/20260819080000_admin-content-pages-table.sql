-- Admin console expansion, item 2 (context/RESUME.md): Content/CMS
-- (/admin/content + public /blog/[slug]). Markdown-in-Postgres, confirmed
-- via research as the right call at this scale (not a headless CMS, not
-- git-based content).

CREATE TABLE public.pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  meta_title TEXT,
  meta_description TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Same lockdown as every other admin-owned table — RLS enabled, zero
-- policies, service-role admin client only. The public /blog/[slug] route
-- also reads through the service-role client (server-only code, never
-- exposed to the browser) with an explicit `status = 'published'` filter
-- in the query itself — simpler and just as safe as adding a real
-- anonymous-read RLS policy for one narrow, always-filtered read path.
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

CREATE INDEX pages_status_idx ON public.pages(status);
