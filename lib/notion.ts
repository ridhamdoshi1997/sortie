// Thin, dependency-free wrapper around Notion's REST API (no @notionhq/client
// — the calls needed here are a handful of fetches, not worth a new
// dependency). Every user connects their OWN Notion "internal integration"
// token (created free at notion.so/my-integrations, shared onto a database
// they own) — there's no OAuth app for this app's own developer account to
// register, so this is buildable without any external console setup.

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export type NotionDatabaseSummary = {
  id: string;
  title: string;
};

export type NotionJobInput = {
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  applicationStatus: string | null;
  matchScore: number | null;
};

export type NotionPageSummary = {
  id: string;
  url: string | null;
  title: string | null;
  company: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offered: "Offered",
  rejected: "Rejected",
};

// Minimal shapes for the handful of Notion REST fields this wrapper
// actually reads — not a full API model, deliberately.
type NotionRichText = { plain_text: string };
type NotionPageProperty = {
  url?: string | null;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
};
type NotionPageResult = { id: string; properties?: Record<string, NotionPageProperty> };
type NotionSearchResult = { id: string; title?: NotionRichText[] };
type NotionApiBody = {
  id?: string;
  bot?: { workspace_name?: string };
  results?: NotionSearchResult[] | NotionPageResult[];
  has_more?: boolean;
  next_cursor?: string;
};

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionFetch(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: NotionApiBody | null }> {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: headers(token),
  });
  const body = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, body };
}

export async function verifyNotionToken(token: string): Promise<{ valid: boolean; workspaceName?: string }> {
  const { ok, body } = await notionFetch(token, "/users/me");
  if (!ok) return { valid: false };
  return { valid: true, workspaceName: body?.bot?.workspace_name ?? undefined };
}

export async function listAccessibleDatabases(token: string): Promise<NotionDatabaseSummary[]> {
  const { ok, body } = await notionFetch(token, "/search", {
    method: "POST",
    body: JSON.stringify({ filter: { value: "database", property: "object" }, page_size: 50 }),
  });
  if (!ok || !Array.isArray(body?.results)) return [];

  return (body.results as NotionSearchResult[]).map((db) => ({
    id: db.id,
    title: db.title?.map((t) => t.plain_text).join("") || "Untitled database",
  }));
}

// Idempotent — Notion's PATCH /databases merges by property name, so calling
// this on every connect only ever creates whatever's missing, never
// clobbers a user's own existing properties of the same names.
export async function ensureTrackerProperties(token: string, databaseId: string): Promise<void> {
  await notionFetch(token, `/databases/${databaseId}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: {
        Company: { rich_text: {} },
        Location: { rich_text: {} },
        Status: {
          select: {
            options: Object.values(STATUS_LABEL).map((name) => ({ name })),
          },
        },
        "Match score": { number: { format: "number" } },
        URL: { url: {} },
      },
    }),
  });
}

function jobToProperties(job: NotionJobInput): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Name: { title: [{ text: { content: job.title || "Untitled role" } }] },
    Company: { rich_text: [{ text: { content: job.company || "" } }] },
    Location: { rich_text: [{ text: { content: job.location || "" } }] },
  };
  if (job.applicationStatus) {
    props.Status = { select: { name: STATUS_LABEL[job.applicationStatus] ?? job.applicationStatus } };
  }
  if (typeof job.matchScore === "number") {
    props["Match score"] = { number: job.matchScore };
  }
  if (job.url) {
    props.URL = { url: job.url };
  }
  return props;
}

export async function createTrackerPage(
  token: string,
  databaseId: string,
  job: NotionJobInput,
): Promise<string | null> {
  const { ok, body } = await notionFetch(token, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: jobToProperties(job),
    }),
  });
  return ok ? body?.id ?? null : null;
}

export async function updateTrackerPage(token: string, pageId: string, job: NotionJobInput): Promise<boolean> {
  const { ok } = await notionFetch(token, `/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: jobToProperties(job) }),
  });
  return ok;
}

// Pages the user (or someone else with access) added directly in Notion —
// used for the read-back "import as new leads" direction. Only pulls the
// URL property since that's all we need to re-run this app's own existing
// external-job import path on it.
export async function listDatabasePages(token: string, databaseId: string): Promise<NotionPageSummary[]> {
  const pages: NotionPageSummary[] = [];
  let cursor: string | undefined;

  do {
    const { ok, body } = await notionFetch(token, `/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 100, start_cursor: cursor }),
    });
    if (!ok || !Array.isArray(body?.results)) break;

    for (const page of body.results as NotionPageResult[]) {
      const urlProp = page.properties?.URL?.url ?? null;
      const titleProp = page.properties?.Name?.title?.map((t) => t.plain_text).join("") || null;
      const companyProp = page.properties?.Company?.rich_text?.map((t) => t.plain_text).join("") || null;
      pages.push({ id: page.id, url: urlProp, title: titleProp, company: companyProp });
    }

    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);

  return pages;
}
