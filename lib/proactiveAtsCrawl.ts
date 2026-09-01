import { fetchAtsJobs, type AtsPlatform } from "@/lib/atsProviders";
import { filterByCity, type NormalizedJob } from "@/lib/jobScraper";

// Proactive ATS crawl (2026-09-01) — see
// migrations/20260901120000_add-proactive-ats-crawl.sql for the full
// rationale. Short version: reactive direct-ATS enrichment
// (lib/actions/scraper.actions.ts's enrichWithDirectAtsJobs) can only ever
// poll a company THIS search already surfaced via SerpApi/Adzuna — it
// structurally can't discover a company those aggregators haven't already
// found. This background-crawls companies ats_registry ALREADY knows have
// a real board (discovered reactively by any past search, for any user),
// independent of whether today's search happens to mention them, and caches
// full board results in discovered_postings for every future search to draw
// on for free.

// Only the three platforms with a real "list everything on this board" call
// with no required search term (fetchAtsJobs) — Workday/iCIMS need a query
// string to search against and have no equivalent "list the whole board"
// endpoint in lib/atsProviders.ts, so they're out of scope for a
// title-agnostic proactive crawl. SmartRecruiters is guessable/discoverable
// the same way but deliberately excluded here too, matching RESUME.md's own
// scope ("Greenhouse/Lever/Ashby endpoints") — no SmartRecruiters-specific
// gap has been observed live yet to justify widening this.
const CRAWLABLE_PLATFORMS: AtsPlatform[] = ["greenhouse", "lever", "ashby"];

// Same posture as lib/atsRegistry.ts's own AdminDb — structurally typed so
// this module stays free of a runtime SDK import; every real caller
// (the cron, the search-time reader) already has an admin client.
type AdminDb = {
  database: {
    from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
};

type CrawlCandidate = {
  company_key: string;
  company_name: string;
  platform: string;
  config: { slug?: string } | null;
};

// Bounded per run, same reasoning as repairApplyLinksAsync's own
// LINK_REPAIR_BATCH_SIZE — a large backlog drains gradually across
// scheduled runs instead of hammering every known employer's board at
// once. Companies are picked oldest-crawled-first (nulls first) so every
// one eventually gets a turn.
const CRAWL_BATCH_SIZE = 15;

export async function crawlKnownAtsCompanies(admin: AdminDb): Promise<{ companiesCrawled: number; postingsUpserted: number }> {
  // Plain cast, not .returns<T>() — this module's AdminDb is a loosely
  // (structurally) typed stand-in, unlike the real SDK client's own
  // generic-aware query builder every other .returns<T>() call site in
  // this codebase uses (lib/actions/scraper.actions.ts, lib/inngest/
  // functions.ts), so a chain rooted in it is already `any` and can't
  // carry type arguments. Same cast idiom lib/atsRegistry.ts's own
  // readRow() already uses against this exact same structural type.
  const { data } = await admin.database
    .from("ats_registry")
    .select("company_key,company_name,platform,config")
    .in("platform", CRAWLABLE_PLATFORMS)
    .order("last_crawled_at", { ascending: true, nullsFirst: true })
    .limit(CRAWL_BATCH_SIZE);
  const candidates = (data as CrawlCandidate[] | null) ?? [];

  if (candidates.length === 0) return { companiesCrawled: 0, postingsUpserted: 0 };

  let postingsUpserted = 0;

  await Promise.all(
    candidates.map(async (candidate) => {
      const slug = candidate.config?.slug;
      const platform = candidate.platform as AtsPlatform;
      if (!slug || !CRAWLABLE_PLATFORMS.includes(platform)) return;

      let jobs: NormalizedJob[] = [];
      try {
        jobs = await fetchAtsJobs(platform, slug, candidate.company_name);
      } catch (error) {
        console.warn(`[proactiveAtsCrawl] fetch failed for ${candidate.company_name}`, error);
      }

      if (jobs.length > 0) {
        const now = new Date().toISOString();
        const rows = jobs.map((job) => ({
          ats_platform: platform,
          company_key: candidate.company_key,
          company_name: candidate.company_name,
          external_id: job.id,
          title: job.title,
          location: job.location || null,
          description: job.description || null,
          salary: job.salary || null,
          job_type: job.type || null,
          apply_url: job.applyUrl ?? job.url,
          posted_at: job.postedAt ?? null,
          last_seen_at: now,
        }));

        const { error } = await admin.database
          .from("discovered_postings")
          .upsert(rows, { onConflict: "ats_platform,company_key,external_id" });
        if (error) console.warn(`[proactiveAtsCrawl] upsert failed for ${candidate.company_name}`, error.message);
        else postingsUpserted += rows.length;
      }

      await admin.database
        .from("ats_registry")
        .update({ last_crawled_at: new Date().toISOString() })
        .eq("company_key", candidate.company_key);
    }),
  );

  return { companiesCrawled: candidates.length, postingsUpserted };
}

// Read side, called from a live search (lib/actions/scraper.actions.ts) —
// the free, instant supplement to that search's own reactive enrichment.
// Simple word-overlap full-text match against the crawl cache's title
// index (search_discovered_postings RPC, migrations/
// 20260901120000_add-proactive-ats-crawl.sql), then the SAME filterByCity
// helper every other ingestion path already runs its results through, so
// this can't reintroduce the wrong-city bug that path was already fixed
// for (see enrichWithDirectAtsJobs's own comment on that incident).
export async function queryProactiveCrawlCache(
  admin: AdminDb,
  searchTitle: string,
  searchLocation: string,
  limit = 30,
): Promise<NormalizedJob[]> {
  const { data, error } = await admin.database.rpc("search_discovered_postings", {
    p_query: searchTitle,
    p_limit: limit,
  });
  if (error || !data) return [];

  type DiscoveredPostingRow = {
    external_id: string;
    ats_platform: string;
    company_name: string;
    title: string | null;
    location: string | null;
    description: string | null;
    salary: string | null;
    job_type: string | null;
    apply_url: string | null;
    posted_at: string | null;
  };

  const rows = data as DiscoveredPostingRow[];
  const normalized: NormalizedJob[] = rows
    .filter((row) => row.title && row.apply_url)
    .map((row) => ({
      id: row.external_id,
      title: row.title as string,
      company: row.company_name,
      location: row.location ?? "",
      description: row.description ?? "",
      url: row.apply_url as string,
      applyUrl: row.apply_url as string,
      salary: row.salary ?? undefined,
      type: row.job_type ?? undefined,
      postedAt: row.posted_at ?? undefined,
      source: row.ats_platform,
    }));

  return filterByCity(normalized, searchLocation);
}
