import { createAdminDbClient } from "@/lib/admin/client";
import { complete, getModel } from "@/lib/models";

export type PageStatus = "draft" | "published";
export type ContentSource = "manual" | "ai_geo";

export type PageRow = {
  id: string;
  slug: string;
  title: string;
  bodyMarkdown: string;
  metaTitle: string | null;
  metaDescription: string | null;
  status: PageStatus;
  contentSource: ContentSource;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PageListRow = Pick<PageRow, "id" | "slug" | "title" | "status" | "contentSource" | "publishedAt" | "updatedAt">;

type RawPageRow = {
  id: string;
  slug: string;
  title: string;
  body_markdown: string;
  meta_title: string | null;
  meta_description: string | null;
  status: PageStatus;
  content_source: ContentSource;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(p: RawPageRow): PageRow {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    bodyMarkdown: p.body_markdown,
    metaTitle: p.meta_title,
    metaDescription: p.meta_description,
    status: p.status,
    contentSource: p.content_source,
    publishedAt: p.published_at,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

function mapListRow(p: Omit<RawPageRow, "body_markdown" | "meta_title" | "meta_description" | "created_at">): PageListRow {
  return { id: p.id, slug: p.slug, title: p.title, status: p.status, contentSource: p.content_source, publishedAt: p.published_at, updatedAt: p.updated_at };
}

export async function listPages(): Promise<PageListRow[]> {
  const admin = createAdminDbClient();
  const { data } = await admin.database
    .from("pages")
    .select("id,slug,title,status,content_source,published_at,updated_at")
    .order("updated_at", { ascending: false });

  return (
    (data ?? []) as Omit<RawPageRow, "body_markdown" | "meta_title" | "meta_description" | "created_at">[]
  ).map(mapListRow);
}

export async function getPageById(id: string): Promise<PageRow | null> {
  const admin = createAdminDbClient();
  const { data } = await admin.database.from("pages").select("*").eq("id", id).maybeSingle<RawPageRow>();
  return data ? mapRow(data) : null;
}

export async function getPageBySlug(slug: string): Promise<PageRow | null> {
  const admin = createAdminDbClient();
  const { data } = await admin.database.from("pages").select("*").eq("slug", slug).maybeSingle<RawPageRow>();
  return data ? mapRow(data) : null;
}

// Public read path — server-only (this whole file only ever runs on the
// server), always explicitly filtered to `status = 'published'`. Doesn't
// need requireAdmin() or its own RLS policy — see the migration's own
// comment for why a filtered service-role read is the simpler, equally
// safe choice for this one narrow always-filtered path.
export async function getPublishedPageBySlug(slug: string): Promise<PageRow | null> {
  const admin = createAdminDbClient();
  const { data } = await admin.database
    .from("pages")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle<RawPageRow>();
  return data ? mapRow(data) : null;
}

export async function listPublishedPages(): Promise<PageListRow[]> {
  const admin = createAdminDbClient();
  const { data } = await admin.database
    .from("pages")
    .select("id,slug,title,status,content_source,published_at,updated_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  return (
    (data ?? []) as Omit<RawPageRow, "body_markdown" | "meta_title" | "meta_description" | "created_at">[]
  ).map(mapListRow);
}

const DRAFT_SYSTEM_PROMPT = `You are drafting a first-pass content page for Sortie, a job-search copilot product for job seekers. Write clear, honest copy — no invented statistics, no fabricated customer quotes or testimonials, no claims about features the product doesn't have. This is a rough first draft an admin will review and edit before publishing, not final copy.

Output ONLY the page body in Markdown (headings, paragraphs, lists as needed). Do not include the page title as a heading (it's supplied and rendered separately) and do not include any frontmatter or commentary before/after the markdown.`;

// AI-assisted first-draft button — same "real data in, honest AI draft
// out, human edits before publish" pattern this app uses everywhere else
// (résumé bullets, document generation). Internal admin tooling, not a
// consumer-facing AI feature, so it deliberately does NOT go through
// checkAndConsumeUsage (lib/usage.ts) — that system caps per-end-user
// consumer actions, not a founder occasionally drafting a page.
export async function generatePageDraft(title: string, brief: string): Promise<string> {
  const userPrompt = `Page title: ${title}\n\nWhat this page should cover: ${brief.trim() || "(no additional brief given — use the title alone to infer intent)"}`;

  const raw = await complete(await getModel("gemini", "smart"), {
    systemPrompt: DRAFT_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5,
    maxTokens: 1400,
  });

  return raw.trim();
}
