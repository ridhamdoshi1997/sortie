import {
  discoverAtsForRegistry,
  fetchAtsJobs,
  fetchRegisteredAtsJobs,
  guessCompanySlugs,
  type AtsPlatform,
  type DiscoveredAts,
} from "@/lib/atsProviders";
import type { NormalizedJob } from "@/lib/jobScraper";

// Global, self-building cache of which ATS each real employer uses — see
// migrations/20260831120000_add-ats-registry.sql for the full rationale.
// Short version: an employer's own ATS board is the only source that is
// legitimate by construction AND free/unlimited, which is exactly what a
// cost-sensitive product needs. Discovery is the expensive part (up to 4
// HTTP fetches per company), so it is paid for once, globally, and reused
// forever after.

function companyKey(company: string): string {
  return company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|company|group|holdings|ulc)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// A known-negative is re-checked occasionally rather than never: a company
// genuinely can migrate onto Greenhouse/Workday later, and a permanent
// "no" would lock us out of that forever.
const RECHECK_NEGATIVE_AFTER_DAYS = 30;

type RegistryRow = {
  company_key: string;
  company_name: string;
  company_domain: string | null;
  platform: string | null;
  config: unknown;
  last_checked_at: string;
  failed_attempts: number;
};

// Structurally typed rather than importing the SDK's own client type:
// callers always already have an admin client (the Inngest crons build
// one, actions use createAdminDbClient), so taking it as a parameter
// keeps this module free of a runtime SDK import — which also lets it be
// exercised directly from a plain script without the SDK's own subpath
// exports needing to resolve.
type AdminDb = {
  database: {
    from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
};

async function readRow(db: AdminDb, key: string): Promise<RegistryRow | null> {
  const { data } = await db.database
    .from("ats_registry")
    .select("company_key, company_name, company_domain, platform, config, last_checked_at, failed_attempts")
    .eq("company_key", key)
    .maybeSingle();
  return (data as RegistryRow | null) ?? null;
}

function isStaleNegative(row: RegistryRow): boolean {
  if (row.platform) return false;
  const age = Date.now() - Date.parse(row.last_checked_at);
  return age > RECHECK_NEGATIVE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

// Tries each guessable-slug platform against each name-derived slug
// candidate, and accepts the first that returns real postings. Only
// reached when careers-page discovery came up empty, and only ever runs
// once per company thanks to the registry cache — the same brute-force
// guessing would be far too wasteful to repeat per search.
// Two candidates only, both .com: the bare name and the legal-suffix-
// stripped one — the same split lib/applyLinkTrust.ts's employerSlugs()
// already established (FDM Group keeps "group", Shopify Inc. drops
// "inc"). Deliberately not exhaustive: each guess costs real HTTP
// fetches, and this only has to work often enough to be worth the one
// cached attempt per company.
function guessCompanyDomains(company: string): string[] {
  const lower = company.toLowerCase();
  const bare = lower.replace(/[^a-z0-9]/g, "");
  const stripped = lower
    .replace(/\b(inc|llc|ltd|corp|co|company|group|holdings|canada|ulc)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
  // Minimum 2, not 3: real employers genuinely have two-letter domains,
  // and a live run proved it matters — "TD" was silently skipped by a
  // 3-char floor even though td.com resolves to their real Workday board.
  return Array.from(new Set([bare, stripped]))
    .filter((s) => s.length >= 2 && s.length <= 30)
    .map((s) => `${s}.com`);
}

const GUESSABLE: AtsPlatform[] = ["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "bamboohr"];

async function guessAtsBySlug(companyName: string): Promise<DiscoveredAts | null> {
  const slugs = guessCompanySlugs(companyName);
  if (slugs.length === 0) return null;

  const attempts = GUESSABLE.flatMap((platform) => slugs.map((slug) => ({ platform, slug })));
  const results = await Promise.all(
    attempts.map(async ({ platform, slug }) => {
      try {
        const jobs = await fetchAtsJobs(platform, slug, companyName);
        return jobs.length > 0 ? { platform, slug } : null;
      } catch {
        return null;
      }
    })
  );
  return results.find((r): r is { platform: AtsPlatform; slug: string } => r !== null) ?? null;
}

// Resolves (and caches) which ATS a company uses. Returns null when the
// company genuinely has no reachable ATS — a normal, common outcome, not
// an error.
export async function resolveAts(
  db: AdminDb,
  companyName: string,
  companyDomain: string | null,
): Promise<DiscoveredAts | null> {
  const key = companyKey(companyName);
  if (key.length < 2) return null;

  const existing = await readRow(db, key);
  if (existing && !isStaleNegative(existing)) {
    const cached = existing.platform ? ({ platform: existing.platform, ...(existing.config as object) } as DiscoveredAts) : null;
    // Same generic-"/Search"-board problem crawlKnownWorkdayCompanies
    // (lib/proactiveAtsCrawl.ts) already self-heals, fixed here too because
    // this is the LIVE path — a real search's own enrichment and the
    // apply-link rescue tier both come through here, and neither was
    // benefiting from that fix. 623 of the 3,114 seeded Workday rows store
    // Workday's default browser route ("Search") instead of a real
    // company-specific board name, which 404s on the actual CXS API
    // (confirmed live). Left unhandled, those 623 employers silently
    // contribute nothing on every search, forever. Re-resolve through the
    // same careers-page discovery used for an unknown company and persist
    // the corrected board, so the cost is paid once per company.
    if (cached?.platform === "workday" && cached.board.toLowerCase() === "search") {
      const domains = existing.company_domain ? [existing.company_domain] : guessCompanyDomains(companyName);
      for (const domain of domains) {
        const rediscovered = await discoverAtsForRegistry(domain);
        if (rediscovered?.platform === "workday" && rediscovered.board.toLowerCase() !== "search") {
          await db.database
            .from("ats_registry")
            .upsert(
              [{ company_key: key, company_name: companyName, company_domain: domain, platform: "workday", config: { ...rediscovered }, last_checked_at: new Date().toISOString(), last_success_at: new Date().toISOString(), failed_attempts: 0 }],
              { onConflict: "company_key" },
            );
          return rediscovered;
        }
      }
      // Genuinely unresolvable for now — return it anyway rather than null
      // so behavior is no worse than before this fix existed.
      return cached;
    }
    return cached;
  }

  // Cache miss (or a stale negative worth re-checking) — pay the discovery
  // cost once, then persist whichever way it lands.
  //
  // Two strategies, because neither alone is sufficient (both verified
  // live): reading the company's careers page catches employers whose
  // board slug isn't derivable from their name (TD -> Workday tenant
  // "td"/"TD_Bank_Careers", Wealthsimple -> Ashby "wealthsimple"), but
  // misses any careers page that renders its board link via JavaScript —
  // a real miss on Stripe and Shopify, both of which certainly do have
  // public boards. The name-derived slug guess catches exactly those.
  // A company domain often isn't derivable from the job's own apply link
  // — an Adzuna or aggregator redirect reveals nothing about the real
  // employer — which would skip careers-page discovery entirely, the
  // strongest of the two strategies. Guessing domains from the name
  // recovers it for a large share of real employers (scotiabank.com,
  // sephora.com, holtrenfrew.com all resolve correctly). A wrong guess is
  // harmless: the fetch simply 404s and we fall through, and the negative
  // is cached so no company is ever guessed at twice.
  const domains = companyDomain ? [companyDomain] : guessCompanyDomains(companyName);

  let discovered: DiscoveredAts | null = null;
  let resolvedDomain: string | null = companyDomain;
  for (const domain of domains) {
    discovered = await discoverAtsForRegistry(domain);
    if (discovered) {
      // Record the domain that actually worked, not the (often null) one
      // we were handed — that's the useful fact for every future lookup.
      resolvedDomain = domain;
      break;
    }
  }
  if (!discovered) discovered = await guessAtsBySlug(companyName);

  const payload = {
    company_key: key,
    company_name: companyName,
    company_domain: resolvedDomain,
    platform: discovered?.platform ?? null,
    config: discovered ? { ...discovered } : null,
    last_checked_at: new Date().toISOString(),
    last_success_at: discovered ? new Date().toISOString() : (existing ? undefined : null),
    failed_attempts: discovered ? 0 : (existing?.failed_attempts ?? 0) + 1,
  };

  // upsert on the unique company_key so concurrent searches for the same
  // company can't create duplicate rows.
  const { error } = await db.database.from("ats_registry").upsert([payload], { onConflict: "company_key" });
  if (error) console.warn("[atsRegistry] upsert failed", key, error.message);

  return discovered;
}

// Which of these companies the registry ALREADY knows have a real board.
// One cheap DB query, so a search can spend its polling budget on the
// employers most likely to yield direct links (instant, already cached)
// rather than on whichever company happened to return the most
// aggregator rows — a real problem observed live, where bulk Adzuna
// results crowded out TD, whose Workday board genuinely had 20 matching
// postings.
export async function partitionByKnownAts(
  db: AdminDb,
  companies: string[],
): Promise<{ known: Set<string>; unknown: Set<string> }> {
  const keys = companies.map(companyKey).filter((k) => k.length >= 2);
  if (keys.length === 0) return { known: new Set(), unknown: new Set() };

  const { data } = await db.database
    .from("ats_registry")
    .select("company_key, platform")
    .in("company_key", keys);

  const rows = (data ?? []) as { company_key: string; platform: string | null }[];
  const known = new Set(rows.filter((r) => r.platform).map((r) => r.company_key));
  const seen = new Set(rows.map((r) => r.company_key));
  const unknown = new Set(keys.filter((k) => !seen.has(k)));
  return { known, unknown };
}

export function toCompanyKey(company: string): string {
  return companyKey(company);
}

// Registry cross-check for a link the name-matching classifier can't
// confirm (2026-09-03, found by a real render test). classifyApplyHost
// verifies an ATS link by checking the URL's tenant slug against the
// company NAME — which fails for any employer whose tenant is an
// abbreviation. Real case: the rescue pipeline successfully upgraded a
// Fidelity International job to its genuine Workday posting at
// fil.wd3.myworkdayjobs.com, and the gate would then have HIDDEN that job,
// because "fil" doesn't string-match "Fidelity International". Our own
// successful rescue thrown away by a heuristic — and it hits abbreviated
// tenants hardest, which skews toward large employers (RBC, TD, BMO, IBM).
//
// The registry already holds the verified answer: it knows this company
// resolves to this exact tenant/slug, established by real discovery or a
// verified dataset seed. So when the classifier can't confirm a link, ask
// the registry whether the URL actually belongs to the board it has on
// record for that employer. Deliberately NOT folded into classifyApplyHost
// itself — that function is sync, DB-free and runs in client components;
// this is the async, server-side second opinion used only at the gate.
export async function isRegistryVerifiedLink(db: AdminDb, companyName: string, applyUrl: string): Promise<boolean> {
  const key = companyKey(companyName);
  if (key.length < 2) return false;

  const row = await readRow(db, key);
  const config = row?.config as { tenant?: string; slug?: string } | null;
  const identifier = config?.tenant ?? config?.slug;
  if (!row?.platform || !identifier || identifier.length < 2) return false;

  try {
    const url = new URL(applyUrl);
    const needle = identifier.toLowerCase();
    // Host for tenant-style platforms (fil.wd3.myworkdayjobs.com,
    // acme.icims.com), path for slug-style ones
    // (job-boards.greenhouse.io/acme/...).
    return url.hostname.toLowerCase().includes(needle) || url.pathname.toLowerCase().includes(`/${needle}`);
  } catch {
    return false;
  }
}

// Real bug found live (2026-09-03), not caught until a full-pipeline test
// against a real query: scraper.actions.ts's own comment on this function's
// caller (enrichWithDirectAtsJobs) already asserted "fetchJobsForCompany
// pulls a company's board FILTERED BY TITLE ONLY" — true for Workday
// (searchText) and iCIMS (its own word-overlap filter, both handled inside
// fetchRegisteredAtsJobs), but never actually true for the 4 slug-based
// platforms (Greenhouse/Lever/Ashby/SmartRecruiters) — fetchRegisteredAtsJobs
// silently drops the searchTitle argument for those and returns a company's
// ENTIRE board. Confirmed live: enriching "Financial Advisor"/Toronto with
// iCapital (a real Greenhouse-hosted company that showed up in that same
// search) pulled 212 of its openings, of which ZERO were finance-relevant
// ("Actuarial Software Engineer", "Agentic AI Engineer", etc.) — Blue Moon
// Metals similarly dumped 33 mining-industry roles. This isn't just
// harmless noise: scrapeAndEvaluateJobs' own MAX_EVALUATED_JOBS=80 trim
// ranks by apply-link TRUST TIER (direct ATS links rank above aggregator
// links), with no relevance check at that stage — meaning a big irrelevant
// board dump from ONE enriched company can crowd Adzuna's actually-relevant
// results entirely out of the 80-slot cap before evaluation ever sees them.
// Fixed here, not in fetchRegisteredAtsJobs itself — that function is also
// called from lib/reresolveApplyLink.ts's per-job rescue path, which needs
// the FULL unfiltered board (it does its own stricter exact-substring
// titlesMatch afterward, and a loose word-overlap pre-filter here could
// wrongly drop a legitimate match when the searched title is longer/more
// specific than the real posting's title). This is the one call site
// that's genuinely a bulk relevance filter, not a specific-posting lookup.
function titleWordsMatch(searchTitle: string, candidateTitle: string): boolean {
  const words = searchTitle
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return true;
  const lowerCandidate = candidateTitle.toLowerCase();
  return words.every((w) => lowerCandidate.includes(w));
}

// Pulls a company's own current openings straight from whichever ATS the
// registry says it uses. Free and unlimited (public ATS endpoints), and
// every link returned is a real posting on the employer's own system.
export async function fetchJobsForCompany(
  db: AdminDb,
  companyName: string,
  companyDomain: string | null,
  searchTitle: string,
): Promise<NormalizedJob[]> {
  const ats = await resolveAts(db, companyName, companyDomain);
  if (!ats) return [];

  try {
    const jobs = await fetchRegisteredAtsJobs(ats, companyName, searchTitle);
    // Workday/iCIMS already filtered server-side/internally (see comment
    // above) — only the 4 slug-based platforms need this extra pass.
    if (ats.platform === "workday" || ats.platform === "icims") return jobs;
    return jobs.filter((job) => titleWordsMatch(searchTitle, job.title));
  } catch (error) {
    console.warn(`[atsRegistry] fetch failed for ${companyName}`, error);
    return [];
  }
}
