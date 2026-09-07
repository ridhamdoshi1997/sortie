import { fetchAtsJobs, fetchRegisteredAtsJobs, discoverAtsForRegistry, type AtsPlatform, type DiscoveredAts } from "@/lib/atsProviders";
import { canonicalCompanyKey } from "@/lib/companyIdentity";
import { type NormalizedJob } from "@/lib/jobScraper";

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
// smartrecruiters added 2026-09-04. It was registered (1,841 companies),
// fully implemented in lib/atsProviders.ts, and reachable through
// fetchAtsJobs' switch -- but absent from THIS list, so the crawl never
// selected it and those companies had zero postings in the cache. Workday
// and iCIMS are legitimately absent (they have their own dedicated crons
// below); SmartRecruiters had neither, so it was simply orphaned.
//
// Verified live against 10 real registry slugs before enabling: 6 returned
// jobs, 166 postings total, ~500ms per board.
const CRAWLABLE_PLATFORMS: AtsPlatform[] = [
  "greenhouse", "lever", "ashby", "smartrecruiters", "workable", "bamboohr", "dayforce",
  // Added 2026-09-04, all keyless and verified live before enabling.
  "breezy", "recruitee", "teamtailor", "join", "personio", "rippling", "pinpoint",
];

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

// Sized against a real measurement, not a guess (2026-09-03). Timing a
// 150-company batch showed 16.3s total of which only 1.3s was fetching —
// the rest was per-company database chatter, since every company issued its
// own upsert, stale-marking read and cursor write (~450 round-trips). Those
// are now batched (see the phases in crawlKnownAtsCompanies), which brought
// the same batch to 12.3s and, more importantly, changed the shape of the
// cost: it now scales with POSTINGS WRITTEN rather than companies visited.
//
// The cron cadence was briefly raised to every 5 minutes to chase coverage
// and then deliberately put BACK to every 15, for two measured reasons.
// First, coverage had already arrived: 22,515 of the registry's 24,064
// companies were crawled, so the backlog that motivated a faster cadence was
// 94% gone, and what remains is periodic re-crawling for freshness — which
// job postings simply do not need every five minutes. Second, this project's
// Supabase plan allows 5 GB of egress a month, and tripling the cadence
// triples the crawl's share of it for almost no benefit.
//
// 200 per 15 minutes (4,800/hour across the three crawlers) comfortably
// sustains freshness over a 24,000-company registry, and each invocation
// stays well inside the 60s ceiling declared in app/api/inngest/route.ts.
// These are plain unauthenticated public endpoints with no shared quota
// (unlike SerpApi), and every company in a batch is a different host, so the
// limit here is our own budget, not politeness. Still ordered
// oldest-crawled-first, so the queue drains evenly and every company gets a
// turn.
const CRAWL_BATCH_SIZE = 200;

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

// Rows per batched upsert, companies per batched cursor update, and
// companies per stale-marking RPC call. All three exist to keep a single
// PostgREST request from growing unbounded — the same payload/URL limit that
// already bit this file's stale-marking once.
const UPSERT_CHUNK_SIZE = 500;
const CURSOR_CHUNK_SIZE = 200;
const STALE_RPC_CHUNK_SIZE = 100;

// Storage guard history, kept because it is the reason the column is gone.
//
// 2026-09-03 capped cached descriptions at 500 chars: most platforms return no
// description in list mode (Greenhouse/Ashby/Workday/BambooHR average 0), but
// Dayforce averaged 3,719 chars per posting and Workable 2,209, and only 131 of
// 692 Dayforce and 3 of 6,499 Workable companies had been crawled at the time.
// Extrapolated across their registries that was 300-400 MB of description text
// alone.
//
// 2026-09-06 removed the column outright. The cap slowed the growth but the
// table still reached 614 MB of a 671 MB database against a 500 MB plan limit,
// with description text 65 MB of the heap. Dropping it costs nothing
// downstream, for the reason the cap's own note already gave: the pre-filter
// exempts direct-ATS sources (lib/jobPreFilter.ts), and a posting a candidate
// opens is evaluated from the employer's own live page, not from this table.

// truncateDescription removed 2026-09-06 along with the column itself. The
// cache stopped storing descriptions when the database hit 671 MB against a
// 500 MB plan limit: discovered_postings was 614 MB of that, and description
// text was 65 MB of the heap.
//
// It is the right thing to drop first because nothing downstream needs it.
// The pre-filter's short-description rule already exempts direct-ATS sources
// (lib/jobPreFilter.ts), and a posting a candidate actually opens goes through
// the on-demand full evaluation path, which reads the employer's own live page
// rather than this table. The 500-char cap this helper enforced was itself
// added to stop Dayforce and Workable (3,719 and 2,209 chars per posting) from
// blowing the same quota -- this finishes that job rather than starting a new
// argument.

// Batched form of markMissingPostingsInactive: one read covering every
// company in the crawl batch, rather than one read per company. Introduced
// 2026-09-03 after measuring that DB chatter, not fetching, was capping
// throughput (16.3s for a 150-company batch, only 1.3s of it fetching).
//
// Per-company semantics are unchanged — the diff is still computed against
// that company's own current ids, and deactivations are still scoped to
// (ats_platform, company_key) — they're just grouped in memory instead of
// costing a round-trip each. Deactivation writes stay per-company because
// they're genuinely rare: a first crawl has nothing to deactivate, and a
// re-crawl usually finds only a handful of companies with removals.
async function markMissingPostingsInactiveBatch(
  cacheDb: AdminDb,
  entries: { platform: string; companyKey: string; companyName: string; currentIds: string[] }[],
): Promise<void> {
  // Sent in chunks purely to bound request BODY size; the response is a
  // single integer either way.
  for (let i = 0; i < entries.length; i += STALE_RPC_CHUNK_SIZE) {
    const chunk = entries.slice(i, i + STALE_RPC_CHUNK_SIZE);
    const { error } = await cacheDb.database.rpc("mark_missing_postings_inactive", {
      p_entries: chunk.map((e) => ({
        platform: e.platform,
        company_key: e.companyKey,
        current_ids: e.currentIds,
      })),
    });
    if (error) console.warn(`[proactiveAtsCrawl] stale-marking RPC failed (${chunk.length} companies)`, error.message);
  }
}

// Single-company convenience wrapper over the same RPC, kept so the Workday
// and iCIMS crawlers (which loop per company for their own reasons) get the
// identical bandwidth and correctness properties without duplicating the
// call shape.
async function markMissingPostingsInactive(
  cacheDb: AdminDb,
  platform: string,
  companyKey: string,
  currentIds: string[],
  companyName: string,
): Promise<void> {
  await markMissingPostingsInactiveBatch(cacheDb, [{ platform, companyKey, companyName, currentIds }]);
}

// Two clients, not one (2026-09-06). ats_registry lives in the MAIN Supabase
// project alongside user data; discovered_postings lives in its own project,
// because at 614 MB it was the entire reason the main database blew its 500 MB
// plan limit. A crawl pass reads the registry and writes postings, so it needs
// both. `cacheDb` defaults to `admin`, which keeps every existing caller and a
// local checkout without CACHE_SUPABASE_* working exactly as before -- the
// split is opt-in by configuration, not a hard requirement.
export async function crawlKnownAtsCompanies(admin: AdminDb, cacheDb: AdminDb = admin): Promise<{ companiesCrawled: number; postingsUpserted: number }> {
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
  const allCandidates = (data as CrawlCandidate[] | null) ?? [];

  // Never fetch the same BOARD twice in one pass. 639 boards in the registry
  // are reachable under more than one company_key (644 redundant rows,
  // almost all Workable and Dayforce), so without this a batch spends slots
  // re-fetching a board it already has -- and every duplicate posting then
  // has to be deduped downstream anyway.
  //
  // Keyed on platform + slug, NOT on the company stem. Those are different
  // questions and conflating them would LOSE coverage: sunlife,
  // sunlifecampus and sunlifeexperienced share a stem but are three genuinely
  // separate Workday boards with different openings on each. Same board is
  // the only safe definition of redundant here.
  //
  // The skipped rows still get their last_crawled_at bumped below, so they
  // rotate out of the oldest-first window instead of blocking it forever.
  const seenBoards = new Set<string>();
  const candidates: CrawlCandidate[] = [];
  const skippedDuplicateBoards: CrawlCandidate[] = [];
  for (const candidate of allCandidates) {
    const slug = candidate.config?.slug;
    const boardKey = slug ? `${candidate.platform}|${slug}` : null;
    if (boardKey && seenBoards.has(boardKey)) {
      skippedDuplicateBoards.push(candidate);
      continue;
    }
    if (boardKey) seenBoards.add(boardKey);
    candidates.push(candidate);
  }
  if (skippedDuplicateBoards.length > 0) {
    console.log(
      `[proactiveAtsCrawl] skipped ${skippedDuplicateBoards.length} duplicate board(s) already covered this pass`,
    );
  }

  if (candidates.length === 0) return { companiesCrawled: 0, postingsUpserted: 0 };

  let postingsUpserted = 0;

  // Phase 1 — fetch every board concurrently, touching no database.
  //
  // Split into phases 2026-09-03 after measuring where the time actually
  // went: a 150-company batch took 16.3s, of which the fetching was 1.3s.
  // The other ~15s was database round-trips, because each company issued its
  // own upsert, its own stale-marking select/update and its own
  // last_crawled_at write — roughly 450 round-trips per batch, nearly all of
  // them tiny. Fetching scales fine on its own (500 boards measured at
  // 1.8s), so the batch size was never limited by the ATS endpoints; it was
  // limited by chatter with Postgres. Batching those writes is what makes a
  // larger CRAWL_BATCH_SIZE viable at all.
  const fetched = await Promise.all(
    candidates.map(async (candidate) => {
      const slug = candidate.config?.slug;
      const platform = candidate.platform as AtsPlatform;
      if (!slug || !CRAWLABLE_PLATFORMS.includes(platform)) {
        return { candidate, platform, jobs: [] as NormalizedJob[], fetchSucceeded: false, skipped: true };
      }

      // Distinct from "board fetched fine, currently has zero postings" —
      // only a genuine fetch success should ever mark anything inactive
      // below. A network blip or a transient upstream error must never be
      // mistaken for "this company removed every one of its postings."
      try {
        const jobs = await fetchAtsJobs(platform, slug, candidate.company_name);
        return { candidate, platform, jobs, fetchSucceeded: true, skipped: false };
      } catch (error) {
        console.warn(`[proactiveAtsCrawl] fetch failed for ${candidate.company_name}`, error);
        return { candidate, platform, jobs: [] as NormalizedJob[], fetchSucceeded: false, skipped: false };
      }
    }),
  );

  // Phase 2 — one upsert per chunk of rows, instead of one per company.
  const now = new Date().toISOString();
  const allRows = fetched.flatMap(({ candidate, platform, jobs }) =>
    jobs.map((job) => ({
      ats_platform: platform,
      company_key: candidate.company_key,
      // Written by the same function lib/postingLiveness.ts reads with, so
      // the two can never drift. See the add-company-stem migration.
      company_stem: canonicalCompanyKey(candidate.company_key),
      company_name: candidate.company_name,
      external_id: job.id,
      title: job.title,
      location: job.location || null,
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
    })),
  );

  const deduped = dedupePostingRows(allRows);
  for (let i = 0; i < deduped.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await cacheDb.database
      .from("discovered_postings")
      .upsert(chunk, { onConflict: "ats_platform,company_key,external_id" });
    if (error) console.warn(`[proactiveAtsCrawl] batched upsert failed (${chunk.length} rows)`, error.message);
    else postingsUpserted += chunk.length;
  }

  // Phase 3 — freshness diff (Phase 40/43): the crawl used to only ever
  // ADD/refresh postings and never notice one had disappeared from the
  // employer's own board, so a filled or pulled role stayed "active" in the
  // cache forever. Only companies whose fetch genuinely SUCCEEDED are
  // eligible: a network blip must never be read as "this company removed
  // every posting." Now one read for the whole batch instead of one per
  // company, with the per-company semantics preserved by grouping in memory.
  const succeeded = fetched.filter((f) => f.fetchSucceeded && !f.skipped);
  if (succeeded.length > 0) {
    await markMissingPostingsInactiveBatch(
      cacheDb,
      succeeded.map((f) => ({
        platform: f.platform,
        companyKey: f.candidate.company_key,
        companyName: f.candidate.company_name,
        currentIds: f.jobs.map((job) => job.id),
      })),
    );
  }

  // Phase 4 — one cursor write for the whole batch. Every candidate is
  // touched, including skipped/failed ones: this list is ordered
  // oldest-crawled-first, so a row that never gets its cursor bumped would
  // win selection on every future batch forever and starve the queue.
  // Includes the duplicate-board rows we skipped fetching. They must be
  // bumped too: selection is oldest-crawled-first, so a row whose cursor is
  // never touched wins every future batch forever and starves the queue --
  // the precise failure this block's own comment above warns about.
  const allKeys = [...candidates, ...skippedDuplicateBoards].map((c) => c.company_key);
  for (let i = 0; i < allKeys.length; i += CURSOR_CHUNK_SIZE) {
    const chunk = allKeys.slice(i, i + CURSOR_CHUNK_SIZE);
    const { error } = await admin.database
      .from("ats_registry")
      .update({ last_crawled_at: new Date().toISOString() })
      .in("company_key", chunk);
    if (error) console.warn(`[proactiveAtsCrawl] cursor update failed (${chunk.length} companies)`, error.message);
  }

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

export async function crawlKnownWorkdayCompanies(admin: AdminDb, cacheDb: AdminDb = admin): Promise<{ companiesCrawled: number; postingsUpserted: number }> {
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
          company_stem: canonicalCompanyKey(candidate.company_key),
          company_name: candidate.company_name,
          external_id: job.id,
          title: job.title,
          location: job.location || null,
          salary: job.salary || null,
          job_type: job.type || null,
          apply_url: job.applyUrl ?? job.url,
          posted_at: job.postedAt ?? null,
          last_seen_at: now,
          is_active: true,
        }));

        const { error } = await cacheDb.database
          .from("discovered_postings")
          .upsert(dedupePostingRows(rows), { onConflict: "ats_platform,company_key,external_id" });
        if (error) console.warn(`[proactiveAtsCrawl] Workday upsert failed for ${candidate.company_name}`, error.message);
        else postingsUpserted += rows.length;
      }

      if (fetchSucceeded) {
        await markMissingPostingsInactive(
          cacheDb,
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

export async function crawlKnownIcimsCompanies(admin: AdminDb, cacheDb: AdminDb = admin): Promise<{ companiesCrawled: number; postingsUpserted: number }> {
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
          company_stem: canonicalCompanyKey(candidate.company_key),
          company_name: candidate.company_name,
          external_id: job.id,
          title: job.title,
          location: job.location || null,
          salary: job.salary || null,
          job_type: job.type || null,
          apply_url: job.applyUrl ?? job.url,
          posted_at: job.postedAt ?? null,
          last_seen_at: now,
          is_active: true,
        }));

        const { error } = await cacheDb.database
          .from("discovered_postings")
          .upsert(dedupePostingRows(rows), { onConflict: "ats_platform,company_key,external_id" });
        if (error) console.warn(`[proactiveAtsCrawl] iCIMS upsert failed for ${candidate.company_name}`, error.message);
        else postingsUpserted += rows.length;
      }

      if (fetchSucceeded) {
        await markMissingPostingsInactive(
          cacheDb,
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

// Storage maintenance (2026-09-03). The crawl only ever adds rows or flips
// them inactive, so without this the cache grows forever — and this project's
// Supabase database is capped at 500 MB, shared with real user data. A
// posting that has been gone from the employer's board for a month is not
// coming back: the employer either filled it or withdrew it, and if it IS
// reposted the crawl re-inserts it (the upsert reactivates on conflict), so
// deleting is safe rather than lossy. Kept as a plain age check on
// last_seen_at, which the crawl already maintains.
// Hard size budget for the cache (2026-09-06).
//
// This table had no limit and the crawl only ever adds: 68,291 companies
// revisited every 15 minutes, nothing ever removed. It reached 500 MB of a
// 559 MB database against a 500 MB free-plan cap -- over the line, with writes
// about to start failing. Moving it to another provider was explored at length
// and would only have raised the ceiling; an append-only cache reaches any
// ceiling eventually.
//
// Evicting is not data loss. The crawl revisits every company on a 15-minute
// cycle, so a posting still live on the employer's board is rewritten on the
// next pass. The ones that do NOT come back are filled, closed or expired --
// exactly the ghost jobs this product exists not to show.
//
// 450,000 holds every market (a market-scoped cache was considered and
// rejected by the product owner) and lands the whole database near 287 MB,
// leaving real headroom for user data on the same 500 MB plan.
const MAX_CACHED_POSTINGS = 450_000;

const INACTIVE_RETENTION_DAYS = 30;

// Keeps the cache inside MAX_CACHED_POSTINGS, newest-seen first.
//
// last_seen_at is the ordering key rather than first_seen_at or posted_at: the
// crawl refreshes it every time a posting is still on its board, so it measures
// "still real", which is what should survive an eviction.
export async function evictCachedPostingsOverBudget(cacheDb: AdminDb): Promise<{ evicted: number }> {
  const { data, error } = await cacheDb.database.rpc("evict_discovered_postings_over_budget", {
    p_max_rows: MAX_CACHED_POSTINGS,
  });
  if (error) {
    // Never throws: this runs on a cron, and a failed eviction must not fail
    // the whole maintenance run. It is logged loudly because a cache that
    // stops evicting is exactly how the storage cap was hit in the first
    // place, and that failure was silent for days.
    console.error("[proactiveAtsCrawl] EVICTION FAILED — the cache is now unbounded until this succeeds", error.message);
    return { evicted: 0 };
  }
  const evicted = typeof data === "number" ? data : 0;
  if (evicted > 0) console.log(`[proactiveAtsCrawl] evicted ${evicted} posting(s) over the ${MAX_CACHED_POSTINGS} budget`);
  return { evicted };
}

export async function pruneStaleDiscoveredPostings(cacheDb: AdminDb): Promise<{ pruned: number }> {
  const cutoff = new Date(Date.now() - INACTIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // head+count so the deleted rows are never shipped back — the point of
  // this function is to protect the storage budget, not to spend egress
  // describing what it removed.
  const { count, error } = await cacheDb.database
    .from("discovered_postings")
    .delete({ count: "exact", head: true })
    .eq("is_active", false)
    .lt("last_seen_at", cutoff);

  if (error) {
    console.warn("[proactiveAtsCrawl] prune failed", error.message);
    return { pruned: 0 };
  }
  return { pruned: count ?? 0 };
}

// Read side, called from a live search (lib/actions/scraper.actions.ts) —
// the free, instant supplement to that search's own reactive enrichment.
// Full-text title match against the crawl cache, with the city constraint
// applied INSIDE the query (search_discovered_postings, see migrations/
// 20260903180000_fix-discovered-postings-location-filter.sql).
//
// Deliberately no longer re-filtered through filterByCity afterwards
// (2026-09-03). That second pass was not merely redundant once the SQL
// filters by city, it was actively destructive: the SQL intentionally keeps
// remote and unknown-location postings alongside city matches, and
// filterByCity then dropped exactly those (it only accepts a literal
// "anywhere" location, or the word "remote" in the TITLE — a posting whose
// LOCATION is "Remote" fails it). Because both run under the same LIMIT,
// those soon-to-be-discarded rows consumed slots that city matches could
// have used: measured live, a "Software Engineer"/Toronto search returned 5
// jobs while 78 genuine Toronto matches sat in the cache. The SQL is now the
// single source of truth for city relevance, and it implements the same
// first-segment-before-the-comma rule filterByCity does, so this cannot
// reintroduce the wrong-city bug that pass was originally added for.
// Below this many rows, a title match is considered too thin to be the whole
// answer and the widened second pass is worth its cost. Half the requested
// limit: a query returning most of what it asked for does not need widening.
const THIN_RESULT_THRESHOLD = 15;

export async function queryProactiveCrawlCache(
  cacheDb: AdminDb,
  searchTitle: string,
  searchLocation: string,
  limit = 30,
): Promise<NormalizedJob[]> {
  // p_location is load-bearing, not an optimisation (2026-09-03): without it
  // the RPC returned the 30 most-recent title matches GLOBALLY and
  // filterByCity below then discarded essentially all of them, so this whole
  // cache contributed ~0 jobs to real searches despite holding 98,000+
  // postings. See migrations/20260903180000_fix-discovered-postings-location-
  // filter.sql for the full measurement.
  //
  // TWO-STAGE title match (2026-09-04). websearch_to_tsquery joins bare words
  // with AND, so "Financial Advisor" compiled to 'financi' & 'advisor' and
  // only matched titles carrying BOTH words. Every "Associate Advisor",
  // "Business Advisor" and "Investment Advisor" in the cache failed the
  // predicate despite being exactly what the searcher wanted.
  //
  // Measured live against the real 463,705-row table:
  //   'Financial Advisor' / Toronto  ->  4 rows, only 1 actually in Toronto
  //   'Registered Nurse'  / Toronto  ->  8 rows, only 1 actually in Toronto
  //   'Software Engineer' / Toronto  -> 30 rows, all 30 in Toronto
  // So AND only starves MULTI-WORD NICHE titles; common ones are fine.
  //
  // Deliberately fixed HERE rather than in the RPC. Rewriting the SQL to OR
  // semantics was tried first and reverted twice: it lifted Financial Advisor
  // to 30 genuine Toronto rows, but 'Software Engineer' then matched ~72,000
  // rows ("engineer" alone) and ts_rank had to score all of them, which
  // exceeded the statement timeout outright. A pg_trgm index on location and
  // a MATERIALIZED location-first CTE were both tried and neither made the
  // common case safe. A widening that breaks the most common query is not a
  // fix, so the fast, known-good SQL is left exactly as it was.
  //
  // Instead: run the precise query first, and only widen when it comes back
  // thin. Common queries never pay for the widening at all, and the fallback
  // is best-effort -- if it times out or errors, the precise results still
  // stand. Same " or " expansion lib/jobRelevance.ts's buildRelevanceQuery
  // already uses for the other full-text path in this codebase.
  const { data, error } = await cacheDb.database.rpc("search_discovered_postings", {
    p_query: searchTitle,
    p_limit: limit,
    p_location: searchLocation || null,
  });
  // Logged, not swallowed (2026-09-04). This returned a bare [] on error,
  // which made a real failure indistinguishable from a genuinely empty
  // cache — and it WAS failing: the query sat on the 8s statement timeout
  // PostgREST's `authenticated` role runs under, so a search intermittently
  // lost the entire 612k-posting contribution and said nothing. Code 57014
  // is that cancellation specifically, called out because it means "too
  // slow", not "no data", and should be read as a performance regression
  // rather than an empty result. See migration
  // 20260904210000_split-discovered-postings-location-or.sql.
  if (error) {
    console.warn(
      `[proactiveAtsCrawl] cache lookup failed for "${searchTitle}"/"${searchLocation}"`,
      (error as { code?: string }).code === "57014" ? `STATEMENT TIMEOUT (57014) — ${error.message}` : error,
    );
    return [];
  }

  let rows_ = (data ?? []) as unknown[];

  const words = searchTitle.trim().split(/\s+/).filter(Boolean);
  if (rows_.length < THIN_RESULT_THRESHOLD && words.length > 1) {
    try {
      const { data: widened, error: widenError } = await cacheDb.database.rpc("search_discovered_postings", {
        p_query: words.join(" or "),
        p_limit: limit,
        p_location: searchLocation || null,
      });
      if (!widenError && Array.isArray(widened) && widened.length > rows_.length) {
        rows_ = widened as unknown[];
      }
    } catch {
      // Best-effort only: keep the precise results rather than failing the
      // whole cache lookup because the widened query was expensive.
    }
  }
  if (!rows_) return [];

  type DiscoveredPostingRow = {
    external_id: string;
    ats_platform: string;
    company_name: string;
    title: string | null;
    location: string | null;
    salary: string | null;
    job_type: string | null;
    apply_url: string | null;
    posted_at: string | null;
  };

  const rows = rows_ as DiscoveredPostingRow[];
  const normalized: NormalizedJob[] = rows
    .filter((row) => row.title && row.apply_url)
    .map((row) => ({
      id: row.external_id,
      title: row.title as string,
      company: row.company_name,
      location: row.location ?? "",
      description: "",
      url: row.apply_url as string,
      applyUrl: row.apply_url as string,
      salary: row.salary ?? undefined,
      type: row.job_type ?? undefined,
      postedAt: row.posted_at ?? undefined,
      source: row.ats_platform,
    }));

  return normalized;
}
