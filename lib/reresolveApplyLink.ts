import { classifyApplyHost, extractLikelyLogoDomain, pickBestApplyLink } from "@/lib/applyLinkTrust";
import { fetchAtsJobs, fetchDiscoveredAtsJobs, guessCompanySlugs, type AtsPlatform } from "@/lib/atsProviders";
import { fetchJobsForCompany, isRegistryVerifiedLink } from "@/lib/atsRegistry";
import { createAdminDbClient } from "@/lib/admin/client";
import type { createInsforgeServer } from "@/lib/insforge-server";

type InsforgeClient = Awaited<ReturnType<typeof createInsforgeServer>>;

// Real regression found live (2026-09-01): merge_job_source's ON CONFLICT
// upsert (migrations/20260831233851_add-job-canonicalization.sql) only
// lets a source overwrite external_apply_url when its source_priority is
// >= the row's stored one — but every update below was writing a newly
// resolved link WITHOUT ever bumping source_priority to match. A job
// upgraded here to a real Workday link stayed recorded at SerpApi's
// priority (50) forever, so the next time the SAME real posting was
// re-scraped by a plain search (still SerpApi, still priority 50, since
// SerpApi's own raw data never changes), the >= check let it silently
// overwrite the good link right back to the original weak one. This
// keeps source_priority honest about what tier of link is ACTUALLY
// stored, matching the same scale sourcePriority() in
// lib/jobCanonicalization.ts uses for the initial ingest path, so a
// resolved upgrade can never be silently clobbered by a re-merge again.
function applyLinkSourcePriority(applyUrl: string, company: string | null | undefined): number {
  const trust = classifyApplyHost(applyUrl, company);
  if (trust === "ats") return 100;
  if (trust === "employer") return 90;
  if (trust === "aggregator") return 50;
  // Above a raw unverified scrape, well below a Tier-1 board — so a future
  // re-merge carrying any better link always wins, and an indirect link can
  // never clobber one. See INDIRECT_AGGREGATOR_HOSTS in applyLinkTrust.ts.
  if (trust === "aggregator_indirect") return 30;
  return 10;
}

// Lazy, on-demand fix for jobs already scraped before lib/applyLinkTrust.ts
// existed, whose stored apply link classifies as a confirmed low-quality
// mirror. Direct exact-listing re-lookup (SerpApi's google_jobs_listing,
// keyed by the job's own external_id) turned out to be a dead end — live-
// tested against two real jobs scraped only ~1 day earlier and both came
// back "job may have expired." Google Jobs' own listing tokens are
// session-scoped, not durable (matches a warning already in
// lib/actions/scraper.actions.ts's own upsert comment) — no tool that
// re-queries by that ID will do better. So this runs a genuinely fresh
// google_jobs search instead (title + location, same engine used for the
// original scrape) and matches the right result back by company name.
//
// Fires from a real page view via next/server's after() (see
// app/find-jobs/[id]/page.tsx — same fire-and-forget pattern already used
// there for last_viewed_at), never blocking the response. Bounded by
// apply_link_resolved_at: attempted exactly once per job, success or not —
// a listing that's genuinely gone won't resolve better on a second try, so
// retrying on every subsequent view would just burn real SerpApi quota for
// nothing (this app currently runs on 3 free-tier accounts shared with
// live search).


function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function titlesMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na.length < 3 || nb.length < 3) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

// Real bug found live (2026-08-30, direct user report — two independent
// confirmed cases: jobs.rbc.com/ca/en/personal-banking, and even worse,
// td.com/us/en/about-us/working-at-td): classifyApplyHost only checks
// DOMAIN trust (is this the real employer's own site?), never whether the
// URL actually points at a specific posting. A company's own domain serves
// both real job pages AND generic category/"working here" marketing pages,
// and a fresh search can just as easily surface the latter — which then
// classifies as "employer," the second-highest trust tier, and gets
// accepted as an "upgrade" over the original (worse, but at least specific)
// link. Real specific postings — across ATS platforms and most corporate
// career sites alike — carry a real numeric requisition/posting ID
// somewhere in the path or query string; a generic landing page never does.
// Deliberately conservative: a real but non-numeric-slugged posting (rare
// among re-resolution candidates specifically, since the whole point of
// re-resolving is recovering from a bad original link) can be missed by
// this check, but that's a missed upgrade, not an active downgrade to a
// generic page while claiming to have fixed it — the correct tradeoff here.
const JOB_ID_QUERY_PARAMS = /[?&](id|jobid|job_id|gh_jid|jk|req|requisition|requisitionid|postingid)=/i;

export function looksLikeSpecificJobPosting(rawUrl: string): boolean {
  try {
    const { pathname, search } = new URL(rawUrl);
    if (/\d{4,}/.test(pathname + search)) return true;
    if (JOB_ID_QUERY_PARAMS.test(search)) return true;
    // Catches hex/alphanumeric ATS ids that mix letters and digits (real
    // case: Workable's own job ids, e.g. "D98E6FECC2" — no run of 4+ pure
    // digits, but clearly an opaque per-posting token, not a category
    // name). A real category slug ("personal-banking", "working-at-td")
    // never contains a digit at all, so this stays safe against both
    // confirmed bad cases while covering this gap.
    const segments = pathname.split("/").filter(Boolean);
    return segments.some((s) => s.length >= 6 && /\d/.test(s));
  } catch {
    return false;
  }
}

const ATS_PLATFORMS: AtsPlatform[] = ["greenhouse", "lever", "ashby", "smartrecruiters"];

// Free, zero-quota first attempt before falling back to a paid SerpApi
// search below — tries each of the 3 known ATS platforms directly against
// a guessed board slug for this job's company (lib/atsProviders.ts,
// guessCompanySlugs). When it hits, the result is a guaranteed-direct link
// by construction (see atsProviders.ts's own comment), not a candidate to
// run through the classifier. Most guesses will 404 (most companies aren't
// on one of these 3 boards, or use a slug this can't guess) — that's
// expected and falls through to the search-based fallback, not an error.
async function tryAtsGuess(job: ResolvableJob): Promise<{ applyUrl: string } | null> {
  const slugs = guessCompanySlugs(job.company as string);
  if (slugs.length === 0) return null;

  const attempts = ATS_PLATFORMS.flatMap((platform) => slugs.map((slug) => ({ platform, slug })));
  const results = await Promise.all(
    attempts.map(({ platform, slug }) => fetchAtsJobs(platform, slug, job.company as string))
  );

  for (const jobs of results) {
    const match = jobs.find((j) => titlesMatch(j.title, job.title as string));
    if (match?.applyUrl) return { applyUrl: match.applyUrl };
  }
  return null;
}

// Registry-backed rescue tier (2026-09-03) — the tier that was structurally
// missing, and the reason Adzuna's real supply was being thrown away
// wholesale. The other free tiers all fail on an Adzuna job for the same
// root cause: tryStoredCandidates needs alternate candidate links Adzuna
// never supplies; tryAtsGuess can only GUESS a board slug from the company
// name (a guess that misses any company whose slug isn't its name); and
// tryEmployerAtsDiscovery has to extract an employer domain from the
// current link — but for an Adzuna job the current link IS adzuna.ca, so
// there's nothing real to extract.
//
// What changed: ats_registry now holds 12,752 real companies with verified
// board configs (9,646 Greenhouse/Lever/Ashby from the LastRound AI seed,
// plus 3,113 Workday tenants from the latmay dataset — Phase 43). That
// turns "which board does this employer use?" from a guess into a lookup,
// keyed on the company NAME the job already carries — no domain extraction
// and no slug guessing required. fetchJobsForCompany reads the registry
// first and only falls back to live discovery on a miss, so a registry hit
// costs a single board fetch.
//
// Deliberately placed BEFORE tryEmployerAtsDiscovery: a registry hit is a
// verified, previously-confirmed board, whereas discovery is a fresh
// 4-fetch guess off a derived domain. Free (public ATS endpoints), so it
// belongs in the freeOnly set. A hit yields an "ats"-tier link — the
// highest trust tier there is — so this rescues these jobs into genuine
// employer postings rather than compromising on link quality.
async function tryRegistryAtsLookup(job: ResolvableJob): Promise<{ applyUrl: string } | null> {
  const admin = createAdminDbClient() as unknown as Parameters<typeof fetchJobsForCompany>[0];
  try {
    const jobs = await fetchJobsForCompany(admin, job.company as string, null, job.title as string);
    const match = jobs.find((candidate) => titlesMatch(candidate.title, job.title as string));
    return match?.applyUrl ? { applyUrl: match.applyUrl } : null;
  } catch (error) {
    console.warn("[reresolveApplyLink] registry lookup failed", job.company, error);
    return null;
  }
}

// Final fallback tier, after the free ATS guess and the paid SerpApi
// search both come up empty — a real Google web search via the
// apify-job-search edge function (functions/apify-job-search.ts, Apify's
// free apify/rag-web-browser Actor). Unlike Google Jobs' own apply_options
// (guaranteed to be FOR this exact posting), a general web search only
// guarantees text relevance, not job relevance — live-tested against a
// real hard case and confirmed it can return true false positives
// (unrelated companies' career pages that just matched the search terms).
// So this tier is deliberately stricter than the others: only "ats" or
// "employer" classifications are accepted, never "aggregator" — a random
// aggregator hit here isn't a safe generic fallback the way it is when it
// comes from Google Jobs' own candidate list, it's an unverified guess.
const APIFY_JOB_SEARCH_URL = "https://umhshbx9.function2.insforge.app/apify-job-search";

async function tryApifySearch(job: ResolvableJob): Promise<{ applyUrl: string } | null> {
  try {
    const res = await fetch(APIFY_JOB_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company: job.company, title: job.title }),
    });
    if (!res.ok) return null;

    const { urls } = (await res.json()) as { urls?: string[] };
    if (!urls) return null;

    const match = urls.find((url) => {
      const trust = classifyApplyHost(url, job.company);
      return (trust === "ats" || trust === "employer") && looksLikeSpecificJobPosting(url);
    });
    return match ? { applyUrl: match } : null;
  } catch (error) {
    console.error("[reresolveApplyLink] apify search failed", job.id, error);
    return null;
  }
}

type ResolvableJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  // The job's CURRENT apply link — used to discover a real company domain
  // for the Workday/iCIMS tier below (extractLikelyLogoDomain). Named to
  // match the real jobs.external_apply_url column so callers that already
  // have the raw DB row (app/find-jobs/[id]/page.tsx) can pass it straight
  // through with no rename. Optional for backward compatibility with any
  // caller that doesn't have it handy; that tier is simply skipped when
  // absent, same as when it's null.
  external_apply_url?: string | null;
  // The raw SerpApi apply-option list already stored on the job row —
  // powers the free tryStoredCandidates() tier below. Same "named to match
  // the real column" reasoning as external_apply_url above.
  raw_apply_options?: unknown;
};

// Real, direct-employer-domain discovery for enterprise ATS platforms that
// have no guessable company slug (Workday, iCIMS — see atsProviders.ts's
// own header comment for why this is a separate mechanism from
// tryAtsGuess). Free (no paid API), tried before the paid SerpApi search
// below for the same reason tryAtsGuess is. Direct fix for a real,
// user-reported case: TD's own bad link (td.com/us/en/about-us/working-
// at-td) already classifies as "employer" trust — extractLikelyLogoDomain
// resolves that to the real domain (td.com), and this discovers TD's real
// Workday tenant from it, confirmed live to return the exact posting.
async function tryEmployerAtsDiscovery(job: ResolvableJob): Promise<{ applyUrl: string } | null> {
  const domain = extractLikelyLogoDomain(job.external_apply_url, job.company);
  if (!domain) return null;

  const { jobs, fallbackSearchUrl } = await fetchDiscoveredAtsJobs(domain, job.company as string, job.title as string);
  const match = jobs.find((c) => titlesMatch(c.title, job.title as string));
  if (match?.applyUrl) return { applyUrl: match.applyUrl };

  // No exact posting match, but a real ATS tenant WAS found — a live,
  // employer-hosted search filtered to this job's title beats the current
  // generic marketing page even though it's not the one exact original
  // listing (which is genuinely gone, not something any search can
  // recover). Real case this fixes: TD's "Private Wealth Client Services
  // Associate" no longer exists on their live board — this now lands on
  // TD's real, live, wealth/banking-filtered search instead of
  // td.com/us/en/about-us/working-at-td.
  //
  // BUT only when the link we'd replace isn't already a specific posting.
  // This tier now also runs for "aggregator" links (a real LinkedIn/Indeed
  // posting for this exact job), and swapping one of those for a generic
  // employer search page would be a clear downgrade — the whole point of
  // the fallback is that it beats a GENERIC page, not a specific one.
  if (!fallbackSearchUrl) return null;
  const currentIsSpecific = job.external_apply_url ? looksLikeSpecificJobPosting(job.external_apply_url) : false;
  if (currentIsSpecific) return null;
  return { applyUrl: fallbackSearchUrl };
}

// Free, zero-API-call, tried FIRST: re-run the picker over the candidate
// list SerpApi already returned for this job and stored on the row. Added
// 2026-08-30 after a real discovery — replaying three genuinely-broken
// jobs' own stored raw_apply_options through the fixed pickBestApplyLink
// showed the correct employer link was sitting in the candidate list the
// whole time (Manulife's real careers.manulife.com posting was literally
// candidate #1, passed over because the buggy classifier picked an
// unrelated company's Workday link as "ats" first). Every job stored
// before the classifier fix has the same latent recovery available for
// free, so trying a fresh paid search before re-checking what's already on
// the row would be both slower and worse.
function tryStoredCandidates(job: ResolvableJob): { applyUrl: string } | null {
  const options = job.raw_apply_options;
  if (!Array.isArray(options) || options.length === 0) return null;

  const links = options
    .map((o) => (o && typeof o === "object" && "link" in o ? (o as { link?: unknown }).link : null))
    .filter((l): l is string => typeof l === "string" && l.length > 0);
  if (links.length === 0) return null;

  const picked = pickBestApplyLink(links, job.company);
  if (!picked || picked === job.external_apply_url) return null;

  // Only ever swap UP to a genuine employer destination — a confirmed ATS
  // board for this company, or the company's own domain. Deliberately NOT
  // a plain trust-rank comparison: "aggregator" ranks above "unverified"
  // in the picker's own ordering, but a real dry run over the live dataset
  // showed that rule proposing active downgrades — Intact Financial and
  // Clio both currently hold their OWN real Workday posting (correct
  // links whose tenant slug just doesn't string-match the company's legal
  // name), and a rank comparison wanted to replace them with a generic
  // Glassdoor/ZipRecruiter listing. An unmatched-tenant ATS link is
  // usually still the real posting; a generic aggregator page never is.
  const pickedTrust = classifyApplyHost(picked, job.company);
  if (pickedTrust !== "ats" && pickedTrust !== "employer") return null;

  return { applyUrl: picked };
}

// `freeOnly` stops before the two PAID tiers (SerpApi search, Apify web
// search) and runs only the three zero-cost ones. Exists for bulk repair
// across the whole backlog: this project's SerpApi access is 3 free-tier
// keys SHARED WITH LIVE USER SEARCH, so running the paid tier over
// hundreds of stored jobs would exhaust the month's quota and break real
// users' searches — a genuine operational limit, not just a budget
// preference.
export async function reresolveApplyLinkForJob(
  insforge: InsforgeClient,
  job: ResolvableJob,
  options?: { freeOnly?: boolean }
): Promise<void> {
  if (!job.title || !job.company) return;

  try {
    const stored = tryStoredCandidates(job);
    if (stored) {
      const { error } = await insforge.database
        .from("jobs")
        .update({
          external_apply_url: stored.applyUrl,
          apply_link_resolved_at: new Date().toISOString(),
          source_priority: applyLinkSourcePriority(stored.applyUrl, job.company),
        })
        .eq("id", job.id);
      if (error) console.error("[reresolveApplyLink] update (stored candidates)", job.id, error);
      return;
    }

    const atsMatch = await tryAtsGuess(job);
    if (atsMatch) {
      const { error } = await insforge.database
        .from("jobs")
        .update({
          external_apply_url: atsMatch.applyUrl,
          apply_link_resolved_at: new Date().toISOString(),
          source_priority: applyLinkSourcePriority(atsMatch.applyUrl, job.company),
        })
        .eq("id", job.id);
      if (error) console.error("[reresolveApplyLink] update (ats match)", job.id, error);
      return;
    }

    const registryMatch = await tryRegistryAtsLookup(job);
    if (registryMatch) {
      const { error } = await insforge.database
        .from("jobs")
        .update({
          external_apply_url: registryMatch.applyUrl,
          apply_link_resolved_at: new Date().toISOString(),
          source_priority: applyLinkSourcePriority(registryMatch.applyUrl, job.company),
        })
        .eq("id", job.id);
      if (error) console.error("[reresolveApplyLink] update (registry ats match)", job.id, error);
      return;
    }

    const discoveredMatch = await tryEmployerAtsDiscovery(job);
    if (discoveredMatch) {
      const { error } = await insforge.database
        .from("jobs")
        .update({
          external_apply_url: discoveredMatch.applyUrl,
          apply_link_resolved_at: new Date().toISOString(),
          source_priority: applyLinkSourcePriority(discoveredMatch.applyUrl, job.company),
        })
        .eq("id", job.id);
      if (error) console.error("[reresolveApplyLink] update (discovered ats match)", job.id, error);
      return;
    }

    // Everything below this line costs real money — see the freeOnly note
    // on this function's signature. Deliberately does NOT stamp
    // apply_link_resolved_at when bailing out here: a free-only pass that
    // found nothing shouldn't permanently mark the job as "already tried"
    // and block a real, full attempt later.
    if (options?.freeOnly) return;

    // REMOVED 2026-09-05 -- this tier called searchJobs() once per rescued
    // job, and that became catastrophically wrong when Phase 46 changed what
    // searchJobs IS.
    //
    // It was written when searchJobs meant a single SerpApi call: cheap,
    // ~1-2s, entirely reasonable to spend recovering one job's apply link.
    // Phase 46 deleted SerpApi and rebuilt searchJobs on the Apify LinkedIn +
    // Indeed ACTORS. This call site was never revisited, so a "paid-tier link
    // rescue" silently became "launch two full job-scraper actors, per job,
    // inside the user's own search request".
    //
    // Measured live on a real "Financial Advisor"/Toronto search
    // (2026-09-05), which is what exposed it:
    //   * link verification took 81,482ms of a 145,159ms search -- more than
    //     the real providers (51,577ms) and everything else combined;
    //   * PAID_RESCUE_CAP is 5, so this fired up to 10 extra actor runs while
    //     this project's Apify plan allows FIVE CONCURRENT RUNS TOTAL. Every
    //     one returned HTTP 402 concurrent-runs-limit-exceeded;
    //   * worse, those runs competed with the search's OWN LinkedIn and Indeed
    //     calls for the same five slots, so the rescue was actively breaking
    //     the search it existed to improve -- both providers also failed with
    //     402 on that run.
    // It cost real money, cost ~80s of a user's wait, returned nothing, and
    // degraded the search. No version of that trade is worth keeping.
    //
    // Jobs reaching here still get every free tier above, the hourly
    // repairApplyLinksAsync cron, and the per-view lazy resolver -- the same
    // fallback verifyApplyLinksBeforeReveal already documents for jobs beyond
    // PAID_RESCUE_CAP. A targeted paid rescue could come back, but it needs an
    // endpoint scoped to ONE posting, not a whole-board scrape, and it must
    // not run inside a live search.

    const apifyMatch = await tryApifySearch(job);
    if (apifyMatch) {
      const { error } = await insforge.database
        .from("jobs")
        .update({
          external_apply_url: apifyMatch.applyUrl,
          apply_link_resolved_at: new Date().toISOString(),
          source_priority: applyLinkSourcePriority(apifyMatch.applyUrl, job.company),
        })
        .eq("id", job.id);
      if (error) console.error("[reresolveApplyLink] update (apify match)", job.id, error);
      return;
    }

    // No better link found — record the attempt so this job isn't retried
    // on every future view. Leaves the existing (worse) link in place
    // rather than clearing it: a low-quality link is still better than no
    // Apply button at all.
    const { error } = await insforge.database
      .from("jobs")
      .update({ apply_link_resolved_at: new Date().toISOString() })
      .eq("id", job.id);
    if (error) console.error("[reresolveApplyLink] update (no match)", job.id, error);
  } catch (error) {
    console.error("[reresolveApplyLink] search failed", job.id, error);
  }
}

function needsLinkResolution(applyUrl: string, company: string | null | undefined): boolean {
  const trust = classifyApplyHost(applyUrl, company);
  return (
    trust === "low_quality" ||
    trust === "unverified" ||
    trust === "aggregator" ||
    // Deliberately included: an indirect board link is a visible FLOOR, not
    // a resting state. Every rescue pass (per-view lazy resolver, hourly
    // repairApplyLinksAsync cron, and each new search) keeps trying to
    // upgrade it to a real employer/ATS posting.
    trust === "aggregator_indirect" ||
    (trust === "employer" && !looksLikeSpecificJobPosting(applyUrl))
  );
}

// "Genuine employer/ATS link, or a trusted major board — nothing else."
// Same bar Phase 38 originally enforced INSIDE the AI evaluation step.
// "aggregator" means classifyApplyHost's TIER1_SAFE_AGGREGATOR_HOSTS list
// (LinkedIn, Indeed, Glassdoor, ZipRecruiter, CareerBuilder, government job
// banks, etc — see applyLinkTrust.ts's own comment); only
// "low_quality"/"unverified" fail.
// Provenance beats heuristics (2026-09-03, found by a real render test, not
// review): a job we fetched OURSELVES from an employer's own board via the
// registry is direct by construction — lib/atsProviders.ts's own header says
// exactly this ("the apply URL in the response IS the employer's real
// posting, not a candidate to run through lib/applyLinkTrust.ts's
// classifier") — but nothing actually enforced that intent here, so those
// links were still being name-matched by classifyApplyHost and could fail.
// Real case that surfaced it: Fidelity International's genuine Workday
// posting at fil.wd3.myworkdayjobs.com classified "unverified" purely
// because the tenant "fil" doesn't string-match "Fidelity International".
// That hits every employer whose ATS tenant is an abbreviation (FIL, RBC,
// TD, BMO, IBM...) — the exact asymmetry classifyApplyHost's own comment
// already flags for RBC. The tenant/company check still guards links from
// UNKNOWN provenance (the Manulife/Tapestry bug it was written for, where an
// unrelated employer's posting arrived via an aggregator's candidate list) —
// it just no longer overrules a board we pulled from ourselves.
const DIRECT_ATS_SOURCES = new Set(["greenhouse", "lever", "ashby", "smartrecruiters", "workday", "icims"]);

export function meetsGenuineLinkBar(
  applyUrl: string | null,
  company: string | null | undefined,
  source?: string | null,
): boolean {
  if (!applyUrl) return false;
  if (source && DIRECT_ATS_SOURCES.has(source.toLowerCase())) return true;
  const trust = classifyApplyHost(applyUrl, company);
  // "aggregator_indirect" (Adzuna — see applyLinkTrust.ts) clears the bar
  // as of 2026-09-03: it's a real, established board, and hiding it outright
  // was discarding 54% of this pipeline's entire supply for employers that
  // provably aren't reachable on any free ATS (measured: 34 of the 44
  // companies behind those hidden jobs are on no supported platform, and a
  // JSearch re-link test found a genuine employer link for 0 of 8). It
  // remains the lowest-ranked visible option and stays permanently eligible
  // for upgrade — see needsLinkResolution above.
  return trust === "ats" || trust === "employer" || trust === "aggregator" || trust === "aggregator_indirect";
}

// Real, direct correction (2026-09-01, direct user feedback) to this
// function's own history the SAME session: it originally hard-hid any job
// the free tier couldn't fix — live-tested and found a real 51->16
// visible-job collapse on "Financial Advisor"/Toronto (root cause: Adzuna,
// added the same session specifically to boost volume, redirects through
// adzuna.ca, which the three free tiers usually can't fix for a company not
// on Greenhouse/Lever/Ashby/SmartRecruiters). The first fix moved the paid-
// tier rescue back to AFTER a match score existed, gated on score >= 70 —
// but that's a DIFFERENT, worse bug: a job's authenticity has nothing to do
// with how well it fits one candidate's profile. A candidate searching
// outside their usual lane (a developer browsing Financial Advisor roles,
// someone exploring a career change) would see real, official postings
// disappear purely because they scored low for THEM — genuine listings
// were being hidden as if they were fake. Confirmed live: 26 of 27 scored
// jobs on that exact search landed at 20/100 (the candidate's profile was a
// software developer's), and every one of them lost its shot at the paid
// rescue and got hidden — not because the postings were fake, but because
// they were a poor fit.
//
// The correct fix: authenticity (this function) and fit (the AI score) are
// orthogonal, and only authenticity should ever gate visibility. So the
// paid rescue now runs HERE, unconditionally, for every job the free tier
// couldn't fix — no score exists yet at this point in the pipeline, and
// none is needed anymore. PAID_RESCUE_CAP bounds it instead — a blunter
// lever, but one that doesn't discriminate against a legitimate posting
// for being a bad fit. Logged when hit so a capped search is visible in
// output, not silently truncated.
//
// Real, direct correction (2026-09-01, same day, caught by the user asking
// a sharp follow-up question — "till yesterday only 2 keys exhausted, what
// about the 3rd?"): the original 30 here was picked as "bounded" without
// actually checking this project's real SerpApi budget. Checked live via
// SerpApi's own account.json: 3 accounts, 250 searches/MONTH each, 750/month
// combined — and BEFORE this rescue mechanism existed, a search cost
// roughly ONE SerpApi call. Each rescued job here is its own real
// searchJobs() call (see reresolveApplyLinkForJob's paid tier below), so a
// cap of 30 meant a single search could cost up to 31 calls — over 4% of
// the ENTIRE MONTHLY budget in one search. That is very likely what
// finished off the third account through ordinary heavy testing THE SAME
// DAY, independent of the separate "unlimited for admin" mistake this
// session already reverted. 5 keeps the real fix (authenticity no longer
// score-gated) while capping worst-case spend at 6 calls/search — ~125
// searches/month if every single one maxed the cap, a sane ceiling against
// a 750/month budget instead of a ~24/month one.
//
// NOT bypassed for admin/owner/testing accounts — a real, live-tested
// mistake this same session (direct user request to remove it, then a
// direct live finding that reverted it): every OTHER cap in this pipeline
// (MAX_EVALUATED_JOBS, the daily quota functions) protects a PER-USER
// allowance, so exempting admin from those is free — it only affects what
// that one account sees. This cap protects a SHARED, finite resource
// instead: this project runs on 3 real SerpApi accounts, the same ones
// every user's live search depends on. Removing the cap for one account
// burned through 2 of the 3 keys in a single search (confirmed live via
// Vercel logs: "SerpApi key 1/3 exhausted", "key 2/3 exhausted") — that's
// not "no limitations for admin," that's admin testing breaking search for
// every other user. A per-user exemption cannot apply to a shared-capacity
// gate; the fix for wanting to see more here is raising this constant (or
// adding more SerpApi accounts), not bypassing it by identity.
const PAID_RESCUE_CAP = 5;

// Phase 1 of the 3-phase redesign — "the moment jobs are canonicalized,
// resolve/verify every job's apply link concurrently before anything
// else." Runs ONCE per search, synchronously, before the search response
// is ever revealed to the candidate — every visible job's link has already
// been checked (free AND, when needed, paid) by the time it's on screen,
// and a job still failing the genuine bar afterward is hidden here, before
// any AI evaluation is ever spent on it.
//
// The free tiers run unthrottled (plain HTTP to ATS platforms/employer
// domains, not an LLM call — no shared rate-limited key to protect). The
// paid tier is a real, metered SerpApi search — same key pool live user
// search itself uses — so it's bounded by PAID_RESCUE_CAP, not run
// unbounded just because it's no longer score-gated.
export async function verifyApplyLinksBeforeReveal<
  T extends {
    id: string;
    title: string | null;
    company: string | null;
    location: string | null;
    external_apply_url: string | null;
    raw_apply_options?: unknown;
  },
>(insforge: InsforgeClient, jobs: T[]): Promise<{ hiddenIds: string[] }> {
  const needsWork = jobs.filter(
    (job) => job.external_apply_url && job.title && job.company && needsLinkResolution(job.external_apply_url, job.company),
  );

  if (needsWork.length > 0) {
    await Promise.all(
      needsWork.map((job) =>
        reresolveApplyLinkForJob(insforge, job, { freeOnly: true }).catch((err) =>
          console.error("[verifyApplyLinksBeforeReveal] free-tier resolve failed", job.id, err),
        ),
      ),
    );
  }

  // Re-fetch every job that either needed resolution above, or never had a
  // link in the first place — everything else already passed and needs no
  // DB round-trip. Batched, not one .in() call over a potentially large id
  // list — same PostgREST URL-length gotcha this codebase has already hit
  // once live (see lib/inngest/functions.ts's own JOB_FETCH_BATCH_SIZE
  // comment).
  const toCheck = jobs.filter((job) => !job.external_apply_url || needsWork.some((w) => w.id === job.id));
  if (toCheck.length === 0) return { hiddenIds: [] };

  const ID_BATCH_SIZE = 50;
  const refetched: { id: string; external_apply_url: string | null; company: string | null; source: string | null }[] = [];
  for (let i = 0; i < toCheck.length; i += ID_BATCH_SIZE) {
    const batchIds = toCheck.slice(i, i + ID_BATCH_SIZE).map((j) => j.id);
    const { data } = await insforge.database
      .from("jobs")
      .select("id,external_apply_url,company,source")
      .in("id", batchIds)
      .returns<{ id: string; external_apply_url: string | null; company: string | null; source: string | null }[]>();
    if (data) refetched.push(...data);
  }
  const byId = new Map(refetched.map((r) => [r.id, r]));

  const stillFailing = toCheck.filter((job) => {
    const current = byId.get(job.id);
    return !meetsGenuineLinkBar(current?.external_apply_url ?? job.external_apply_url, current?.company ?? job.company, current?.source ?? null);
  });

  // Unconditional paid rescue, bounded only by PAID_RESCUE_CAP — see this
  // module's own comment above for why score no longer gates this — and
  // PAID_RESCUE_CAP's own comment for why this cap applies uniformly, with
  // no admin/owner/testing exemption.
  const toRescue = stillFailing.slice(0, PAID_RESCUE_CAP);
  if (stillFailing.length > PAID_RESCUE_CAP) {
    console.log(
      `[verifyApplyLinksBeforeReveal] ${stillFailing.length} jobs still need a paid-tier link rescue, capped at ${PAID_RESCUE_CAP} for this search — the rest fall back to the hourly repairApplyLinksAsync cron (free tier only) and the per-view lazy resolver.`,
    );
  }
  if (toRescue.length > 0) {
    await Promise.all(
      toRescue.map((job) =>
        reresolveApplyLinkForJob(insforge, job, { freeOnly: false }).catch((err) =>
          console.error("[verifyApplyLinksBeforeReveal] paid-tier rescue failed", job.id, err),
        ),
      ),
    );
  }

  // Final check — only for jobs that just went through a rescue attempt;
  // anything beyond the cap (or that never needed rescue) already has its
  // answer from `stillFailing`/the original pass-through.
  const rescuedIds = new Set(toRescue.map((j) => j.id));
  const finalRefetched: { id: string; external_apply_url: string | null; company: string | null; source: string | null }[] = [];
  for (let i = 0; i < toRescue.length; i += ID_BATCH_SIZE) {
    const batchIds = toRescue.slice(i, i + ID_BATCH_SIZE).map((j) => j.id);
    const { data } = await insforge.database
      .from("jobs")
      .select("id,external_apply_url,company,source")
      .in("id", batchIds)
      .returns<{ id: string; external_apply_url: string | null; company: string | null; source: string | null }[]>();
    if (data) finalRefetched.push(...data);
  }
  const finalById = new Map(finalRefetched.map((r) => [r.id, r]));

  const failedFinalCheck = stillFailing.filter((job) => {
    if (!rescuedIds.has(job.id)) return true; // capped out — still failing, no further check needed
    const current = finalById.get(job.id);
    return !meetsGenuineLinkBar(current?.external_apply_url ?? job.external_apply_url, current?.company ?? job.company, current?.source ?? null);
  });

  // Last chance before hiding: ask the registry whether this link genuinely
  // belongs to the board it has on record for this employer. Catches the
  // abbreviated-tenant case the name-matching classifier structurally
  // can't (see isRegistryVerifiedLink in lib/atsRegistry.ts for the real
  // Fidelity International case that surfaced it) — a job whose link we
  // successfully rescued to the employer's own ATS must never be discarded
  // just because the tenant slug doesn't spell out the company name.
  const registryDb = createAdminDbClient() as unknown as Parameters<typeof isRegistryVerifiedLink>[0];
  const registryVerdicts = await Promise.all(
    failedFinalCheck.map(async (job) => {
      const current = finalById.get(job.id);
      const url = current?.external_apply_url ?? job.external_apply_url;
      const company = current?.company ?? job.company;
      if (!url || !company) return false;
      return isRegistryVerifiedLink(registryDb, company, url).catch(() => false);
    }),
  );

  const hiddenIds = failedFinalCheck.filter((_, i) => !registryVerdicts[i]).map((job) => job.id);

  if (hiddenIds.length > 0) {
    // Only ever SETS is_hidden true — matches every other hide-write in
    // this codebase. A job could already be hidden for an unrelated reason
    // (a user action); this must never un-hide one.
    for (let i = 0; i < hiddenIds.length; i += ID_BATCH_SIZE) {
      const batchIds = hiddenIds.slice(i, i + ID_BATCH_SIZE);
      const { error } = await insforge.database.from("jobs").update({ is_hidden: true }).in("id", batchIds);
      if (error) console.error("[verifyApplyLinksBeforeReveal] hide write failed", error);
    }
  }

  return { hiddenIds };
}
