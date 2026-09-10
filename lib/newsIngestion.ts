import { createAdminDbClient } from "@/lib/admin/client";
import { fetchViaJinaReader } from "@/agent/research";
import { complete, getModel } from "@/lib/models";

// News section ingestion (build-plan.md, direct user request 2026-08-30) —
// real free Google News RSS per category, Jina Reader (already in this
// app's stack since Phase 6) pulls clean article text, Gemini synthesizes a
// "career impact" line or discards the article as not genuinely relevant.
// Cross-industry by design, not tech-only — see the category queries below.

export type NewsCategory =
  | "hiring_layoffs"
  | "ai_future_of_work"
  | "workplace_rto"
  | "unions_worker_rights"
  | "burnout_wellbeing"
  | "gig_freelance";

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  hiring_layoffs: "Hiring & Layoffs",
  ai_future_of_work: "AI & Future of Work",
  workplace_rto: "Workplace & RTO",
  unions_worker_rights: "Unions & Worker Rights",
  burnout_wellbeing: "Burnout & Wellbeing",
  gig_freelance: "Gig & Freelance",
};

// Four categories added 2026-09-10 on the user's ask, researched via agy and
// then VOLUME-CHECKED against the real free Google News feed before being
// wired in (7-day counts: Workplace & RTO 48, Unions & Worker Rights 100,
// Burnout & Wellbeing 54, Gig & Freelance 100 — none at risk of looking
// dead). All four are deliberately non-tech-skewed, which is the correction
// the user made during Phase 35: real sampled headlines included a UofT
// strike mandate, a Thunder Bay childcare staffing shortage and gig-economy
// coverage, not software-industry news.
//
// The three candidates Phase 35 REJECTED are still rejected and were not
// revisited: Business & Economy (undifferentiated against Hiring & Layoffs),
// Tech & Startups (tech-skewed), Compensation (salary data moves quarterly,
// so the tab would look dead).

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
  workplace_rto:
    'https://news.google.com/rss/search?q=%22return+to+office%22+OR+%22remote+work+policy%22+OR+%22four+day+workweek%22+OR+%22workplace+culture%22+when:7d',
  unions_worker_rights:
    'https://news.google.com/rss/search?q=%22union%22+OR+%22strike%22+OR+%22minimum+wage%22+OR+%22worker+rights%22+OR+%22non-compete%22+when:7d',
  burnout_wellbeing:
    'https://news.google.com/rss/search?q=%22worker+burnout%22+OR+%22workplace+mental+health%22+OR+%22staffing+shortage%22+OR+%22employee+wellbeing%22+when:7d',
  gig_freelance:
    'https://news.google.com/rss/search?q=%22gig+economy%22+OR+%22freelance%22+OR+%22independent+contractor%22+OR+%22side+hustle%22+when:7d',
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
// Cost is real but small: 1 credit per category per run, 6 categories on a
// daily cron = 6 credits/day against Serper free tier'''s 2,500 one-time
// credits, so well over a year before it matters. It is NOT free, which is
// why SerpApi sits above it and the RSS path below is kept as a working
// fallback — if the key is missing, out of credits, or erroring, ingestion
// silently continues and simply has no images for those rows.
//
// NOTE for anyone reading a balance off the response headers: x-ratelimit-
// limit/remaining is a 25-req/SECOND rate limit that resets continuously, NOT
// the account credit balance. Misreading it as a balance produced a false
// "about to run out" panic on 2026-09-10. The real balance is only on
// Serper'''s dashboard.
const CATEGORY_SERPER_QUERIES: Record<NewsCategory, string> = {
  hiring_layoffs: '"layoffs" OR "hiring surge" OR "plant closing"',
  ai_future_of_work: '"artificial intelligence" AND ("workforce" OR "jobs")',
  workplace_rto: '"return to office" OR "remote work policy" OR "four day workweek" OR "workplace culture"',
  unions_worker_rights: '"union" OR "strike" OR "minimum wage" OR "worker rights" OR "non-compete"',
  burnout_wellbeing: '"worker burnout" OR "workplace mental health" OR "staffing shortage" OR "employee wellbeing"',
  gig_freelance: '"gig economy" OR "freelance" OR "independent contractor" OR "side hustle"',
};

// SerpApi's Google News engine — tried BEFORE Serper (2026-09-10, direct
// user ask: "can't we use SerpApi?"). It is the better fit here for reasons
// checked live rather than assumed:
//   * Three keys are already configured, and NOTHING else in this codebase
//     consumes them any more — the SerpApi job providers went dormant on
//     2026-09-04 and no live code path reads SERPAPI_KEY. So the whole
//     allowance is available for news.
//   * Free plan is 250 searches/month per key = 750 across the three,
//     against a news need of 6/day (~180/month). Comfortable.
//   * It is already paid for in the sense that it costs nothing extra,
//     where Serper is a real per-credit spend.
//
// Confirmed live 2026-09-10: all three keys read 250/250 used, 0 left, and
// the account's own `plan_renewal_date` is 2026-09-16. So this path returns
// nothing until that date and ingestion simply falls through to Serper and
// then to RSS in the meantime — which is exactly why the chain below is
// ordered rather than swapped.
//
// NOT yet verified against a live SerpApi news response, because there is no
// quota to spend on one until the 16th. The parsing below follows SerpApi's
// documented google_news shape (news_results[].{title,link,source,thumbnail}
// plus the `stories` grouping it uses for clustered coverage); re-check it
// against a real response the first time this actually runs.
type SerpApiNewsResult = {
  title?: string;
  link?: string;
  thumbnail?: string;
  date?: string;
  source?: { name?: string; icon?: string } | string;
  stories?: SerpApiNewsResult[];
};

function serpApiKeys(): string[] {
  return [process.env.SERPAPI_KEY, process.env.SERPAPI_KEY_FALLBACK, process.env.SERPAPI_KEY_FALLBACK_2]
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k))
    .filter((k, i, all) => all.indexOf(k) === i);
}

function serpApiSourceName(source: SerpApiNewsResult["source"]): string | null {
  if (!source) return null;
  return typeof source === "string" ? source : (source.name ?? null);
}

function flattenSerpApiResults(results: SerpApiNewsResult[]): SerpApiNewsResult[] {
  // google_news returns clustered coverage as a `stories` array on a parent
  // entry that itself has no link. Flattening keeps those real articles
  // instead of dropping a whole cluster.
  return results.flatMap((r) => (Array.isArray(r.stories) && r.stories.length > 0 ? r.stories : [r]));
}

async function fetchViaSerpApi(category: NewsCategory): Promise<RssItem[] | null> {
  const keys = serpApiKeys();
  if (keys.length === 0) return null;

  for (let i = 0; i < keys.length; i++) {
    try {
      const params = new URLSearchParams({
        engine: "google_news",
        q: CATEGORY_SERPER_QUERIES[category],
        api_key: keys[i],
      });
      const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
        signal: AbortSignal.timeout(20_000),
      });
      const json = (await res.json()) as { news_results?: SerpApiNewsResult[]; error?: string };

      // "Your account has run out of searches" is the documented exhaustion
      // message and is the ONLY thing worth spending the next key on — a
      // malformed query would fail identically on all three.
      if (json.error) {
        if (/run out of searches|out of searches|monthly limit/i.test(json.error)) {
          console.warn(`[newsIngestion] SerpApi key #${i + 1} exhausted for ${category} — trying the next key`);
          continue;
        }
        console.warn(`[newsIngestion] SerpApi error for ${category}: ${json.error}`);
        return null;
      }

      const items = flattenSerpApiResults(json.news_results ?? [])
        .filter((n): n is SerpApiNewsResult & { title: string; link: string } => Boolean(n.title && n.link))
        .map((n) => ({
          title: n.title,
          link: n.link,
          // SerpApi reports relative ages the same way Serper does; left null
          // rather than converted, for the same reason.
          pubDate: null,
          sourceName: serpApiSourceName(n.source),
          sourceDomain: hostFromUrl(n.link),
          imageUrl: n.thumbnail ?? null,
        }));

      if (items.length > 0) {
        if (i > 0) console.warn(`[newsIngestion] ${category} served by SerpApi fallback key #${i + 1}`);
        return items;
      }
      return null;
    } catch (error) {
      console.warn(`[newsIngestion] SerpApi request failed for ${category}`, error);
      return null;
    }
  }

  console.warn(`[newsIngestion] every SerpApi key is out of searches — falling back to Serper/RSS`);
  return null;
}

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

  // Source chain, cheapest-that-works first:
  //   1. SerpApi   — free 250/mo x3 keys, already owned, nothing else uses it
  //   2. Serper    — real per-credit spend, kept as the bridge until SerpApi's
  //                  2026-09-16 renewal and as cover if SerpApi errors
  //   3. Google RSS— free and always available, but carries NO article image
  // Each step returns null (not throws) when it can't serve, so a dead key or
  // an exhausted plan degrades quietly instead of breaking ingestion.
  let items = await fetchViaSerpApi(category);
  if (!items) items = await fetchViaSerper(category);

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
