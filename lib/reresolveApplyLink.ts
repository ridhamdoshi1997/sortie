import { searchJobs } from "@/lib/jobScraper";
import { classifyApplyHost, extractLikelyLogoDomain, pickBestApplyLink } from "@/lib/applyLinkTrust";
import { fetchAtsJobs, fetchDiscoveredAtsJobs, guessCompanySlugs, type AtsPlatform } from "@/lib/atsProviders";
import type { createInsforgeServer } from "@/lib/insforge-server";

type InsforgeClient = Awaited<ReturnType<typeof createInsforgeServer>>;

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
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|group|holdings|canada|ulc)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function companiesMatch(a: string, b: string): boolean {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (na.length < 2 || nb.length < 2) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

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
  return fallbackSearchUrl ? { applyUrl: fallbackSearchUrl } : null;
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
        })
        .eq("id", job.id);
      if (error) console.error("[reresolveApplyLink] update (ats match)", job.id, error);
      return;
    }

    const discoveredMatch = await tryEmployerAtsDiscovery(job);
    if (discoveredMatch) {
      const { error } = await insforge.database
        .from("jobs")
        .update({
          external_apply_url: discoveredMatch.applyUrl,
          apply_link_resolved_at: new Date().toISOString(),
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

    const results = await searchJobs(job.title, job.location ?? "", "ca");
    const match = results.find((r) => companiesMatch(r.company, job.company as string));

    if (
      match?.applyUrl &&
      classifyApplyHost(match.applyUrl, job.company) !== "low_quality" &&
      looksLikeSpecificJobPosting(match.applyUrl)
    ) {
      const { error } = await insforge.database
        .from("jobs")
        .update({
          external_apply_url: match.applyUrl,
          raw_apply_options: match.rawApplyOptions ?? null,
          apply_link_resolved_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      if (error) console.error("[reresolveApplyLink] update (resolved)", job.id, error);
      return;
    }

    const apifyMatch = await tryApifySearch(job);
    if (apifyMatch) {
      const { error } = await insforge.database
        .from("jobs")
        .update({
          external_apply_url: apifyMatch.applyUrl,
          apply_link_resolved_at: new Date().toISOString(),
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
