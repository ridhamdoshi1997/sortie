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

type RssItem = {
  title: string;
  link: string;
  pubDate: string | null;
  sourceName: string | null;
  sourceDomain: string | null;
  /** Real per-article image. Only the Serper path supplies one; the RSS feed has no image at all. */
  imageUrl?: string | null;
};

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
// Bare host, no protocol and no "www." — the shape /api/logo's upstream
// (unavatar.io) expects. Returns null rather than throwing on anything
// unparseable, so one malformed attribute never drops a real story.
function hostFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function parseRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  for (const block of itemBlocks) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? null;
    const sourceName = block.match(/<source url="[^"]*">([\s\S]*?)<\/source>/)?.[1] ?? null;
    // The publisher's OWN url, which the feed carries as an attribute on the
    // same <source> tag whose text we already read. Verified live against the
    // real feed: `<source url="https://www.princegeorgecitizen.com">Prince
    // George Citizen</source>`. It was being thrown away, and it is the only
    // per-story publisher identity this feed provides — the <link> is an
    // opaque news.google.com redirect, so nothing else here can produce a
    // real brand mark for a story.
    const sourceUrl = block.match(/<source url="([^"]*)"/)?.[1] ?? null;

    if (!title || !link) continue;

    items.push({
      title: decodeHtmlEntities(title.trim()),
      link: link.trim(),
      pubDate,
      sourceName: sourceName ? decodeHtmlEntities(sourceName.trim()) : null,
      sourceDomain: hostFromUrl(sourceUrl),
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

// Serper's Google News endpoint — the only source tried that returns a real
// per-article IMAGE and the publisher's REAL article URL (2026-09-10, direct
// user requirement: the image must be the article's own, like Google News).
//
// Why this rather than the free RSS feed below: verified live, a Google News
// RSS <item> carries no image of any kind, and its <link> is an opaque
// news.google.com/rss/articles/CBMi… redirect whose real destination Google
// encrypts — fetching it returns a 585KB JS interstitial with the publisher's
// URL nowhere in the markup, so no og:image can be read from it either.
// Serper returns `link` (https://www.latimes.com/business/story/…) and
// `imageUrl` directly, both confirmed against live results.
//
// Cost is real but small: 1 credit per category per run, 2 categories on a
// 6-hourly cron = 8 credits/day. Serper bills roughly $0.001/credit, so about
// $0.25 a month. It is NOT free, which is why the RSS path below is kept as a
// working fallback rather than deleted — if the key is missing, out of
// credits, or erroring, ingestion silently continues on the free source and
// simply has no images for those rows.
const CATEGORY_SERPER_QUERIES: Record<NewsCategory, string> = {
  hiring_layoffs: '"layoffs" OR "hiring surge" OR "plant closing"',
  ai_future_of_work: '"artificial intelligence" AND ("workforce" OR "jobs")',
};

type SerperNewsItem = { title?: string; link?: string; source?: string; imageUrl?: string; date?: string };

// Serper's own `imageUrl` is Google's THUMBNAIL cache — measured live at
// 120x73, which is fine in a list row and visibly soft stretched across a
// lead card. The publisher's own og:image is the full-resolution version of
// the same picture, and it is reachable now for the first time: Serper gives
// us the real article URL, which the Google News RSS path never did.
//
// Best-effort by design. A publisher that blocks us, times out, or ships no
// og:image simply keeps the thumbnail — never a placeholder, and never a
// reason to drop a real story. One short fetch per NEW article only (at most
// ~16 a day at this cron's cadence), so it adds no meaningful cost.
async function fetchOgImage(articleUrl: string): Promise<string | null> {
  try {
    const res = await fetch(articleUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SortieBot/1.0)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;

    // Only the <head> is needed, and some article pages are megabytes.
    const html = (await res.text()).slice(0, 120_000);
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);

    // decodeHtmlEntities matters here, not just for tidiness: publisher
    // og:image URLs are HTML attributes, so their query strings arrive with
    // &amp; escapes. Drupal-style signed image styles (…?h=…&amp;itok=…) 404
    // outright when that is left un-decoded, because the token parameter never
    // parses as its own key.
    const url = match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
    if (!url) return null;
    // Resolve protocol-relative and root-relative values against the article.
    return new URL(url, articleUrl).toString();
  } catch {
    return null;
  }
}

async function fetchViaSerper(category: NewsCategory): Promise<RssItem[] | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch("https://google.serper.dev/news", {
      method: "POST",
      headers: { "X-API-KEY": key, "Content-Type": "application/json" },
      // num MUST stay at 10 — verified live: a free Serper account rejects
      // num=20 outright with 400 "Query pattern not allowed for free
      // accounts", while 10 returns normally. Raising it silently breaks
      // ingestion back onto the image-less RSS fallback.
      body: JSON.stringify({ q: CATEGORY_SERPER_QUERIES[category], num: 10, tbs: "qdr:w" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[newsIngestion] Serper returned ${res.status} for ${category} — falling back to RSS`);
      return null;
    }

    const json = (await res.json()) as { news?: SerperNewsItem[] };
    const items = (json.news ?? [])
      .filter((n): n is SerperNewsItem & { title: string; link: string } => Boolean(n.title && n.link))
      .map((n) => ({
        title: n.title,
        link: n.link,
        // Serper reports relative ages ("5 days ago"), not timestamps. Left
        // null rather than converted: a parsed-from-relative date would be
        // an invented precision, and published_at is already nullable
        // everywhere it is read.
        pubDate: null,
        sourceName: n.source ?? null,
        sourceDomain: hostFromUrl(n.link),
        imageUrl: n.imageUrl ?? null,
      }));

    return items.length > 0 ? items : null;
  } catch (error) {
    console.warn(`[newsIngestion] Serper failed for ${category}, falling back to RSS`, error);
    return null;
  }
}

export async function ingestNewsForCategory(category: NewsCategory): Promise<{ inserted: number; skipped: number }> {
  const client = createAdminDbClient();

  // Paid-but-cheap source first (real links + real images), free RSS second.
  let items = await fetchViaSerper(category);

  if (!items) {
    const response = await fetch(CATEGORY_FEEDS[category], {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { inserted: 0, skipped: 0 };

    const xml = await response.text();
    items = parseRssItems(xml);
  }

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
        source_domain: item.sourceDomain,
        // Full-resolution publisher image when we can get it, Serper's
        // thumbnail when we cannot.
        image_url: (await fetchOgImage(item.link)) ?? item.imageUrl ?? null,
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
  source_domain: string | null;
  image_url: string | null;
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
