import { fetchAtsJobs, fetchRegisteredAtsJobs, discoverAtsForRegistry, type AtsPlatform, type DiscoveredAts } from "@/lib/atsProviders";
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

// The slug-based platforms with a real "list everything on this board" call
// needing no search term (fetchAtsJobs). Workday and iCIMS are NOT here —
// they're tenant-based with a different call shape, so they get their own
// crawlers below (crawlKnownWorkdayCompanies, crawlKnownIcimsCompanies).
// Workable joined this list 2026-09-03 alongside its new adapter; it drops
// straight in because it's slug-based like the rest, and it's the only one
// of them that returns full descriptions in list mode. SmartRecruiters is
// guessable/discoverable the same way but stays excluded until a real
// SmartRecruiters-specific gap is observed live, matching the original
// scope decision rather than widening on speculation.
const CRAWLABLE_PLATFORMS: AtsPlatform[] = ["greenhouse", "lever", "ashby", "workable", "bamboohr", "dayforce"];

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

// Raised from 15 (Phase 40/43, direct user decision): the registry just
// grew from ~80 organically-discovered companies to ~9,646 via the free
// LastRound AI ATS directory seed — at the old 15/30min rate, one full pass
// would have taken ~13 days. These are plain, unauthenticated public JSON
// GET requests to Greenhouse/Lever/Ashby (no shared quota to protect, no
// per-key rate limit the way SerpApi has), so there's no equivalent budget
// constraint to the paid-tier caps elsewhere in this codebase — the only
// real limit is being reasonably polite to each company's own endpoint,
// which this doesn't threaten since every company in a batch is a
// different server. Still bounded (not unbounded) so a backlog drains
// gradually across runs rather than in one giant burst; companies are
// picked oldest-crawled-first (nulls first) so newly-seeded rows — all
// currently null — get priority and every company eventually gets a turn.
const CRAWL_BATCH_SIZE = 150;

// Real bug found live 2026-09-03 while crawling Workable: stale-marking
// failed with a bare "Bad Request" for Anduril Industries and ALO — the two
// companies in that batch with the MOST postings. Cause: the diff was
// expressed as a single PostgREST `.not("external_id","in",(...))` filter
// carrying every current posting id inline, so a big board blows the URL
// length limit. The failure was silent-by-design (logged, non-fatal), which
// made it worse: stale-marking is exactly what stops filled/pulled roles
// showing forever, and it was failing precisely for the largest employers,
// where it matters most.
//
// Now diffed in memory instead: read this company's active ids (one small
// select), compute what's missing, and deactivate only those, in batches —
// the same ID_BATCH_SIZE approach lib/reresolveApplyLink.ts already uses
// after hitting this identical PostgREST gotcha. Shared by all three
// crawlers rather than a fourth copy of the same block.
// Real bug found live 2026-09-03: "ON CONFLICT DO UPDATE command cannot
// affect row a second time" — a board returned the SAME posting id twice in
// one response, so a single upsert carried two rows with an identical
// (ats_platform, company_key, external_id) tuple, which Postgres rejects
// outright. That fails the whole batch for that company, not just the
// duplicate, so one sloppy board silently cost us every posting it had.
// Deduped on exactly the conflict key the upsert targets; last occurrence
// wins, matching the upsert's own "latest write wins" semantics.
function dedupePostingRows<T extends { ats_platform: string; company_key: string; external_id: string }>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(`${row.ats_platform}|${row.company_key}|${row.external_id}`, row);
  return [...byKey.values()];
}

const STALE_ID_BATCH_SIZE = 50;

async function markMissingPostingsInactive(
  admin: AdminDb,
  platform: string,
  companyKey: string,
  currentIds: string[],
  companyName: string,
): Promise<void> {
  const { data, error } = await admin.database
    .from("discovered_postings")
    .select("external_id")
    .eq("ats_platform", platform)
    .eq("company_key", companyKey)
    .eq("is_active", true);

  if (error) {
    console.warn(`[proactiveAtsCrawl] stale-marking read failed for ${companyName}`, error.message);
    return;
  }

  const current = new Set(currentIds);
  const missing = ((data as { external_id: string }[] | null) ?? [])
    .map((row) => row.external_id)
    .filter((id) => !current.has(id));
  if (missing.length === 0) return;

  for (let i = 0; i < missing.length; i += STALE_ID_BATCH_SIZE) {
    const batch = missing.slice(i, i + STALE_ID_BATCH_SIZE);
    const { error: updateError } = await admin.database
      .from("discovered_postings")
      .update({ is_active: false })
      .eq("ats_platform", platform)
      .eq("company_key", companyKey)
      .in("external_id", batch);
    if (updateError) console.warn(`[proactiveAtsCrawl] stale-marking failed for ${companyName}`, updateError.message);
  }
}

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
      // Distinct from "board fetched fine, currently has zero postings" —
      // only a genuine fetch success should ever mark anything inactive
      // below. A network blip or a transient upstream error must never be
      // mistaken for "this company removed every one of its postings."
      let fetchSucceeded = false;
      try {
        jobs = await fetchAtsJobs(platform, slug, candidate.company_name);
        fetchSucceeded = true;
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
          // Explicit, not left to the column default — a posting that was
          // previously marked inactive (removed, then genuinely reposted)
          // must be reactivated here, and upsert's ON CONFLICT path only
          // touches the columns actually listed, not defaults.
          is_active: true,
        }));

        const { error } = await admin.database
          .from("discovered_postings")
          .upsert(dedupePostingRows(rows), { onConflict: "ats_platform,company_key,external_id" });
        if (error) console.warn(`[proactiveAtsCrawl] upsert failed for ${candidate.company_name}`, error.message);
        else postingsUpserted += rows.length;
      }

      // Real freshness fix (Phase 40/43): this used to only ever ADD/refresh
      // postings, never notice one had disappeared from the employer's own
      // board — a filled or pulled role stayed "active" in the cache
      // forever. Diff this fetch's own external_ids against whatever this
      // company already has marked active; anything missing gets flagged,
      // but ONLY when the fetch itself genuinely succeeded (see
      // fetchSucceeded above) — a failed fetch must never be treated as
      // evidence every posting is gone.
      if (fetchSucceeded) {
        await markMissingPostingsInactive(
          admin,
          platform,
          candidate.company_key,
          jobs.map((job) => job.id),
          candidate.company_name,
        );
      }

      await admin.database
        .from("ats_registry")
        .update({ last_crawled_at: new Date().toISOString() })
        .eq("company_key", candidate.company_key);
    }),
  );

  return { companiesCrawled: candidates.length, postingsUpserted };
}

// Workday proactive crawl (Phase 40/43) — a REAL, working "list mode"
// exists despite Workday having no dedicated list-everything endpoint:
// its CXS search API (fetchRegisteredAtsJobs, lib/atsProviders.ts) accepts
// an empty searchText and returns the board's current postings same as a
// real browse (confirmed live, 2026-09-02, against real tenants —
// `axiomspace` returned total=81, `samaritanhealth` total=264 with an
// empty query). Seeded from a real, verified dataset (huggingface.co/
// datasets/latmay/ats-career-page-urls, 5,410 Workday tenant URLs,
// CC-BY-4.0) — 3,113 ingested into ats_registry after company-key
// deduplication. Kept as a SEPARATE function from crawlKnownAtsCompanies
// rather than folded in, since Workday needs a real POST body (searchText)
// and a different config shape (tenant/wdInstance/locale/board vs a plain
// slug) — merging the two would make both harder to read for no real gain.
//
// Real gap found live, RESOLVED this session (Phase 43 → 44): ~1,323 of the
// 5,410 seeded rows had their canonical URL ending in a generic "/Search"
// path rather than a company-specific board name — Workday's own default
// browser UI route, not the real CXS API board identifier — confirmed live
// this 404s on the actual API call (company-specific board names worked
// fine). Rather than drop these 1,323 companies, a generic "search" board
// is now re-resolved through the SAME careers-page-HTML-scraping technique
// discoverAtsFromDomain()/discoverAtsForRegistry() already use for
// brand-new companies, using the company_domain already stored on the row
// from the original seed. A successful re-resolution is persisted back onto
// the registry row's config — this only ever costs the extra careers-page
// fetch once per company, not on every future crawl. failed_attempts (an
// existing ats_registry column) caps retries at 5 for companies whose
// domain genuinely doesn't expose a discoverable board (dead domain, moved
// off Workday, etc.) — without that cap a permanently-unresolvable company
// would re-attempt discovery on every single crawl pass forever.
const WORKDAY_CRAWL_BATCH_SIZE = 100;
const WORKDAY_SEARCH_BOARD_MAX_ATTEMPTS = 5;

type WorkdayCrawlCandidate = {
  company_key: string;
  company_name: string;
  company_domain: string | null;
  config: { tenant?: string; wdInstance?: string; locale?: string; board?: string } | null;
  failed_attempts: number | null;
};

export async function crawlKnownWorkdayCompanies(admin: AdminDb): Promise<{ companiesCrawled: number; postingsUpserted: number }> {
  const { data } = await admin.database
    .from("ats_registry")
    .select("company_key,company_name,company_domain,config,failed_attempts")
    .eq("platform", "workday")
    .order("last_crawled_at", { ascending: true, nullsFirst: true })
    .limit(WORKDAY_CRAWL_BATCH_SIZE);
  const candidates = (data as WorkdayCrawlCandidate[] | null) ?? [];

  if (candidates.length === 0) return { companiesCrawled: 0, postingsUpserted: 0 };

  let postingsUpserted = 0;

  await Promise.all(
    candidates.map(async (candidate) => {
      let { tenant, wdInstance, locale, board } = candidate.config ?? {};
      const failedAttempts = candidate.failed_attempts ?? 0;
      // Every exit path from here on MUST touch last_crawled_at exactly
      // once — this is oldest-crawled-first ordered, so a candidate that
      // returns early without bumping it would keep winning every future
      // batch's selection forever instead of cycling like everything else.
      const touchCrawled = (extra: Record<string, unknown> = {}) =>
        admin.database
          .from("ats_registry")
          .update({ last_crawled_at: new Date().toISOString(), ...extra })
          .eq("company_key", candidate.company_key);

      if (!tenant || !wdInstance || !board) {
        await touchCrawled();
        return;
      }

      if (board.toLowerCase() === "search") {
        if (!candidate.company_domain || failedAttempts >= WORKDAY_SEARCH_BOARD_MAX_ATTEMPTS) {
          await touchCrawled();
          return;
        }
        const rediscovered = await discoverAtsForRegistry(candidate.company_domain);
        if (rediscovered?.platform === "workday" && rediscovered.board.toLowerCase() !== "search") {
          tenant = rediscovered.tenant;
          wdInstance = rediscovered.wdInstance;
          locale = rediscovered.locale;
          board = rediscovered.board;
          await admin.database
            .from("ats_registry")
            .update({ config: { tenant, wdInstance, locale, board }, failed_attempts: 0 })
            .eq("company_key", candidate.company_key);
        } else {
          await touchCrawled({ failed_attempts: failedAttempts + 1 });
          return;
        }
      }

      const discovered: DiscoveredAts = { platform: "workday", tenant, wdInstance, locale: locale ?? "en-US", board };

      let jobs: NormalizedJob[] = [];
      let fetchSucceeded = false;
      try {
        jobs = await fetchRegisteredAtsJobs(discovered, candidate.company_name, "");
        fetchSucceeded = true;
      } catch (error) {
        console.warn(`[proactiveAtsCrawl] Workday fetch failed for ${candidate.company_name}`, error);
      }

      if (jobs.length > 0) {
        const now = new Date().toISOString();
        const rows = jobs.map((job) => ({
          ats_platform: "workday",
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
          is_active: true,
        }));

        const { error } = await admin.database
          .from("discovered_postings")
          .upsert(dedupePostingRows(rows), { onConflict: "ats_platform,company_key,external_id" });
        if (error) console.warn(`[proactiveAtsCrawl] Workday upsert failed for ${candidate.company_name}`, error.message);
        else postingsUpserted += rows.length;
      }

      if (fetchSucceeded) {
        await markMissingPostingsInactive(
          admin,
          "workday",
          candidate.company_key,
          jobs.map((job) => job.id),
          candidate.company_name,
        );
      }

      await touchCrawled();
    }),
  );

  return { companiesCrawled: candidates.length, postingsUpserted };
}

// iCIMS proactive crawl (2026-09-03) — closes a gap that had made the whole
// iCIMS adapter dead weight. fetchIcimsJobs (lib/atsProviders.ts) has
// existed and been live-verified since the original ATS-adapter work, but
// ats_registry contained ZERO iCIMS companies, so it had never once
// contributed a job. Seeded 1,617 real tenants from the same CC-BY-4.0
// latmay/ats-career-page-urls dataset the Workday seed came from, after
// live-verifying the adapter against 6 random tenants from it (6/6 returned
// real postings, 82 job links — across maintenance, healthcare, software,
// legal and energy roles, i.e. genuinely cross-vertical coverage, not the
// tech-only skew the Greenhouse/Lever/Ashby boards tend to have).
//
// Kept separate from both other crawlers for the same reason those are
// separate from each other: iCIMS is tenant-based (no slug, no Workday
// board/instance), and its list mode is "call fetchIcimsJobs with an empty
// search title", which that function already handles by skipping its own
// title filter entirely. Same batch/diff/is_active semantics as the others.
const ICIMS_CRAWL_BATCH_SIZE = 100;

type IcimsCrawlCandidate = {
  company_key: string;
  company_name: string;
  config: { tenant?: string } | null;
};

export async function crawlKnownIcimsCompanies(admin: AdminDb): Promise<{ companiesCrawled: number; postingsUpserted: number }> {
  const { data } = await admin.database
    .from("ats_registry")
    .select("company_key,company_name,config")
    .eq("platform", "icims")
    .order("last_crawled_at", { ascending: true, nullsFirst: true })
    .limit(ICIMS_CRAWL_BATCH_SIZE);
  const candidates = (data as IcimsCrawlCandidate[] | null) ?? [];

  if (candidates.length === 0) return { companiesCrawled: 0, postingsUpserted: 0 };

  let postingsUpserted = 0;

  await Promise.all(
    candidates.map(async (candidate) => {
      const tenant = candidate.config?.tenant;
      const touchCrawled = () =>
        admin.database
          .from("ats_registry")
          .update({ last_crawled_at: new Date().toISOString() })
          .eq("company_key", candidate.company_key);

      if (!tenant) {
        await touchCrawled();
        return;
      }

      let jobs: NormalizedJob[] = [];
      let fetchSucceeded = false;
      try {
        // Empty search title = list mode (see this block's own comment).
        jobs = await fetchRegisteredAtsJobs({ platform: "icims", tenant }, candidate.company_name, "");
        fetchSucceeded = true;
      } catch (error) {
        console.warn(`[proactiveAtsCrawl] iCIMS fetch failed for ${candidate.company_name}`, error);
      }

      if (jobs.length > 0) {
        const now = new Date().toISOString();
        const rows = jobs.map((job) => ({
          ats_platform: "icims",
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
          is_active: true,
        }));

        const { error } = await admin.database
          .from("discovered_postings")
          .upsert(dedupePostingRows(rows), { onConflict: "ats_platform,company_key,external_id" });
        if (error) console.warn(`[proactiveAtsCrawl] iCIMS upsert failed for ${candidate.company_name}`, error.message);
        else postingsUpserted += rows.length;
      }

      if (fetchSucceeded) {
        await markMissingPostingsInactive(
          admin,
          "icims",
          candidate.company_key,
          jobs.map((job) => job.id),
          candidate.company_name,
        );
      }

      await touchCrawled();
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
