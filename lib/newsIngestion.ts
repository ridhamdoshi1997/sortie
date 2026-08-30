import { createAdminDbClient } from "@/lib/admin/client";
import { fetchViaJinaReader } from "@/agent/research";
import { complete, getModel } from "@/lib/models";

// News section ingestion (build-plan.md, direct user request 2026-08-30) —
// real free Google News RSS per category, Jina Reader (already in this
// app's stack since Phase 6) pulls clean article text, Gemini synthesizes a
// "career impact" line or discards the article as not genuinely relevant.
// Cross-industry by design, not tech-only — see the category queries below.

export type NewsCategory = "hiring_layoffs" | "ai_future_of_work";

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  hiring_layoffs: "Hiring & Layoffs",
  ai_future_of_work: "AI & Future of Work",
};

// Cross-industry queries — verified live 2026-08-30 that Google News RSS
// returns real, well-formed <item> results for both (100 items/query,
// standard RSS 2.0 shape). Deliberately not tech-only: hiring_layoffs
// naturally surfaces retail/manufacturing/healthcare labor movements
// alongside tech ones, and ai_future_of_work targets "workforce"/"jobs"
// impact rather than a tech-publication feed, so it reads on how AI affects
// mainstream white-collar (and increasingly blue-collar) work, not just
// software roles.
const CATEGORY_FEEDS: Record<NewsCategory, string> = {
  hiring_layoffs:
    'https://news.google.com/rss/search?q=%22layoffs%22+OR+%22hiring+surge%22+OR+%22plant+closing%22+when:7d',
  ai_future_of_work:
    'https://news.google.com/rss/search?q=%22artificial+intelligence%22+AND+(%22workforce%22+OR+%22jobs%22)+when:7d',
};

const MAX_NEW_ITEMS_PER_RUN = 8;

type RssItem = { title: string; link: string; pubDate: string | null; sourceName: string | null };

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// Google News RSS is a standard RSS 2.0 feed — verified live, not guessed.
// A small regex-based extractor is used instead of a new XML-parser
// dependency since the real, verified structure is simple and consistent:
// one <item> per story, each with <title>/<link>/<pubDate>/<source>.
function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  for (const block of itemBlocks) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? null;
    const sourceName = block.match(/<source url="[^"]*">([\s\S]*?)<\/source>/)?.[1] ?? null;

    if (!title || !link) continue;

    items.push({
      title: decodeHtmlEntities(title.trim()),
      link: link.trim(),
      pubDate,
      sourceName: sourceName ? decodeHtmlEntities(sourceName.trim()) : null,
    });
  }

  return items;
}

type Synthesis = { summary: string; careerImpact: string; companyName: string | null } | null;

// One Gemini call per article — asked to discard anything that isn't
// genuinely career-relevant (generic stock-ticker noise, sports layoffs
// coverage that isn't really about a labor market signal, etc.) rather than
// force every fetched article into the feed. Fast tier: this is a cheap,
// high-volume classification task, not a user-facing generation call.
async function synthesizeCareerImpact(title: string, articleText: string): Promise<Synthesis> {
  const raw = await complete(await getModel("gemini", "fast"), {
    systemPrompt: `You are Sortie's news analyst. Read a real news article and decide if it's genuinely relevant to someone managing their career or job search — not just tangentially mentioning employment. If the article is generic market noise, a single company's routine PR, or not really about jobs/hiring/workforce impact, return {"relevant": false}.

If it IS relevant, return JSON:
{
  "relevant": true,
  "summary": "2 plain-English sentences summarizing what happened",
  "careerImpact": "1 sentence on why a job seeker or employee should care — a concrete, specific takeaway, not generic advice",
  "companyName": "the single primary company this article is about, in its common short form (e.g. 'Google', 'Amazon'), or null if the article isn't primarily about one specific company"
}

Return ONLY valid JSON, no markdown fences.`,
    userPrompt: `Headline: ${title}\n\nArticle text:\n${articleText.slice(0, 6000)}`,
    temperature: 0.3,
    maxTokens: 400,
    jsonResponse: true,
  });

  try {
    const parsed = JSON.parse(raw) as {
      relevant: boolean;
      summary?: string;
      careerImpact?: string;
      companyName?: string | null;
    };
    if (!parsed.relevant || !parsed.summary || !parsed.careerImpact) return null;
    return { summary: parsed.summary, careerImpact: parsed.careerImpact, companyName: parsed.companyName || null };
  } catch {
    return null;
  }
}

export async function ingestNewsForCategory(category: NewsCategory): Promise<{ inserted: number; skipped: number }> {
  const client = createAdminDbClient();

  const response = await fetch(CATEGORY_FEEDS[category], {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return { inserted: 0, skipped: 0 };

  const xml = await response.text();
  const items = parseRssItems(xml);

  const { data: existing } = await client.database
    .from("news_items")
    .select("source_url")
    .eq("category", category)
    .returns<{ source_url: string }[]>();
  const existingUrls = new Set((existing ?? []).map((r) => r.source_url));

  const freshItems = items.filter((item) => !existingUrls.has(item.link)).slice(0, MAX_NEW_ITEMS_PER_RUN);

  let inserted = 0;
  let skipped = 0;

  for (const item of freshItems) {
    const articleText = await fetchViaJinaReader(item.link);
    if (!articleText) {
      skipped++;
      continue;
    }

    const synthesis = await synthesizeCareerImpact(item.title, articleText);
    if (!synthesis) {
      skipped++;
      continue;
    }

    const { error } = await client.database.from("news_items").insert([
      {
        category,
        company_name: synthesis.companyName,
        title: item.title,
        source_url: item.link,
        source_name: item.sourceName,
        ai_summary: synthesis.summary,
        ai_career_impact: synthesis.careerImpact,
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      },
    ]);

    if (error) {
      // Real, expected race: the same article can appear in more than one
      // category's RSS results (e.g. an AI-layoffs story hits both feeds).
      // source_url's UNIQUE constraint is the real dedup backstop here — a
      // 23505 from a concurrent/duplicate insert is not a fatal error.
      skipped++;
    } else {
      inserted++;
    }
  }

  return { inserted, skipped };
}

export async function ingestAllNewsCategories(): Promise<Record<NewsCategory, { inserted: number; skipped: number }>> {
  const categories = Object.keys(CATEGORY_FEEDS) as NewsCategory[];
  const results = {} as Record<NewsCategory, { inserted: number; skipped: number }>;

  for (const category of categories) {
    results[category] = await ingestNewsForCategory(category);
  }

  return results;
}

export type NewsItem = {
  id: string;
  category: string;
  company_name: string | null;
  title: string;
  source_url: string;
  source_name: string | null;
  ai_summary: string;
  ai_career_impact: string;
  published_at: string | null;
};

export async function listNewsByCategory(category: NewsCategory, limit = 30): Promise<NewsItem[]> {
  const client = createAdminDbClient();
  const { data } = await client.database
    .from("news_items")
    .select("*")
    .eq("category", category)
    .order("published_at", { ascending: false })
    .limit(limit)
    .returns<NewsItem[]>();
  return data ?? [];
}

export async function listNewsForCompanies(companyNames: string[], limit = 5): Promise<NewsItem[]> {
  if (companyNames.length === 0) return [];
  const client = createAdminDbClient();
  const { data } = await client.database
    .from("news_items")
    .select("*")
    .in("company_name", companyNames)
    .order("published_at", { ascending: false })
    .limit(limit)
    .returns<NewsItem[]>();
  return data ?? [];
}
