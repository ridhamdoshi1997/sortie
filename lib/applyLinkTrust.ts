// Trust classification for a job's "apply" destination.
//
// Grounded in a real research pass (agy CLI, 2026-08-26) plus a live scan of
// this app's own scraped dataset that found roughly 23% of stored apply
// links (bebee.com alone, 224 of 981) already routed through low-quality
// job-board mirrors instead of the employer's own page — plus at least one
// SEO-farm mirror masquerading as a listing (cajobstoday.janhitjobs.com).
// A hardcoded blocklist can never keep pace with new scam/mirror domains
// (they're spun up faster than any list can track), so this ranks
// candidates by how likely they are to be the REAL employer destination
// instead of trying to enumerate every bad one.

export type ApplyLinkTrust = "ats" | "employer" | "aggregator" | "low_quality" | "unverified";

// Applicant Tracking Systems — a match here is almost certainly the
// employer's own real posting (the company chose to host it there),
// regardless of what else is in the candidate list. The gold standard.
const ATS_HOSTS = [
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "ashbyhq.com",
  "workable.com",
  "smartrecruiters.com",
  "icims.com",
  "taleo.net",
  "breezy.hr",
  "recruitee.com",
];

// Major boards with real trust & safety teams and genuine employer
// relationships — not the direct employer, but a safe, moderated landing
// page. Deliberately preferred over an unknown/unverified domain: an
// unknown domain is far more likely to be a data-harvesting registration
// wall or a paid-per-click redirect loop than LinkedIn or Indeed is.
const TIER1_SAFE_AGGREGATOR_HOSTS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "glassdoor.ca",
  "ziprecruiter.com",
  "ziprecruiter.ca",
  "careerbuilder.com",
  "jobbank.gc.ca",
  "eluta.ca",
  "jobboom.com",
  "careerbeacon.com",
  // Added 2026-08-30 after a real measurement pass found legitimate,
  // well-known boards landing in the "unverified" bucket — a
  // classification gap, not a link-quality problem. Every one of these is
  // already trusted elsewhere in this codebase: extension/README.md's
  // capture support covers Built In, We Work Remotely, RemoteOK, Dice and
  // Monster as first-class sources with real per-site extractors, so
  // treating the same domains as unknown here was an internal
  // contradiction. Flagging them "unverified" also wasted repair attempts
  // on links that were never broken.
  "builtin.com",
  "builtintoronto.com",
  "builtinnyc.com",
  "builtinchicago.org",
  "weworkremotely.com",
  "remoteok.com",
  "remoteok.io",
  "dice.com",
  "monster.com",
  "monster.ca",
  "wellfound.com",
  "welcometothejungle.com",
  "otta.com",
];

// Known high-volume, low-curation scrapers/redirect engines — real,
// documented user complaints (registration walls, redirect loops, "ghost"/
// expired listings). Never picked as the primary choice; only ever a last
// resort, and flagged as such in the UI so a candidate can make an informed
// call before entering any personal information.
const TIER2_LOW_QUALITY_HOSTS = [
  "bebee.com",
  "jooble.org",
  "talent.com",
  "jobrapido.com",
  "simplyhired.ca",
  "simplyhired.com",
  "workopolis.com",
  "whatjobs.com",
  "jobleads.com",
  "lensa.com",
  "appcast.io",
  "adzuna.com",
  "adzuna.ca",
  "expertini.com",
];

function normalizedHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function hostMatches(host: string, known: string[]): boolean {
  return known.some((h) => host === h || host.endsWith(`.${h}`));
}

// Best-effort "is this domain the employer's own" check — same
// sanitization idea as CompanyLogo.tsx's guessCompanyDomain, applied in the
// other direction (does a known company name show up in this host, not the
// reverse). Imperfect on its own (a mirror site named e.g. "shopifyjobs.com"
// could false-positive) — which is why it only ever runs after the ATS
// check and before the Tier-1 fallback, never as the sole signal a link is
// safe. Slugs under 4 chars are skipped entirely to avoid ambiguous
// short-name matches (e.g. "co", "hr").
// Two candidate slugs, since real employer domains split both ways on
// whether they keep a legal-suffix word: FDM Group's real domain is
// fdmgroup.com (keeps "group"), Shopify Inc.'s is shopify.com (drops
// "inc"). Checking only the stripped form false-flagged fdmgroup.com/
// intactfc.com as "unverified" in a live check against this app's real
// dataset — try the bare (unstripped) slug first, then the stripped one.
function employerSlugs(company: string): string[] {
  const lower = company.toLowerCase();
  const bare = lower.replace(/[^a-z0-9]/g, "");
  const stripped = lower
    .replace(/\b(inc|llc|ltd|corp|co|company|group|holdings|canada|ulc)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
  return Array.from(new Set([bare, stripped])).filter((s) => s.length > 0);
}

function looksLikeEmployerHost(host: string, company: string): boolean {
  const labels = host.split(".");

  for (const slug of employerSlugs(company)) {
    if (slug.length < 2) continue;

    // An exact full-label match is safe even for a short slug (RBC, BMO,
    // HP, EY are all real employer domains — jobs.rbc.com, apply.hp.com —
    // and "one dot-separated label equals the company's slug exactly"
    // isn't ambiguous the way a substring match on a short string would be.
    if (labels.some((label) => label === slug)) return true;

    // Below 4 chars, only the exact match above counts — a substring/
    // contains check on something that short (e.g. slug "hp" inside label
    // "shipment") collides far too easily to trust.
    if (slug.length < 4) continue;
    if (labels.some((label) => label.length >= 4 && (label.includes(slug) || slug.includes(label)))) return true;
  }

  return false;
}

// Domain lists alone can't catch a novel scam/SEO-farm mirror — they're
// spun up faster than any list can track (agy research). But the URL
// *shape* is a real, distinctive tell independent of which domain it's on:
// a job posting served from a "/blogs/news/" (or similar content-marketing)
// path, or from a subdomain that reads like a templated content-farm name
// ("cajobstoday.janhitjobs.com"), is not how any real ATS or company
// careers page is ever structured. Confirmed against the exact fraud-flagged
// link a user reported live (2026-08-26): cajobstoday.janhitjobs.com/blogs/
// news/... — a domain no static list would ever contain, caught by shape
// instead. Legitimate unrecognized small-company career pages essentially
// never match this, so it doesn't reintroduce the false-positive problem a
// broader "unverified = suspicious" rule would.
const SUSPICIOUS_PATH_PATTERN = /\/(blogs?|news|articles?)\//i;
const SUSPICIOUS_SUBDOMAIN_PATTERN = /(jobstoday|jobsnow|hiringnow|jobsurgent|jobalert|nowhiring)/i;

function looksLikeScamShape(rawUrl: string): boolean {
  try {
    const { hostname, pathname } = new URL(rawUrl);
    return SUSPICIOUS_PATH_PATTERN.test(pathname) || SUSPICIOUS_SUBDOMAIN_PATTERN.test(hostname);
  } catch {
    return false;
  }
}

// Real bug found live (2026-08-30, direct user report): a job titled/
// company'd "Manulife" had external_apply_url pointing at
// tapestry.wd108.myworkdayjobs.com — a completely unrelated employer
// (Tapestry, the Coach/Kate Spade parent). Root cause: this classifier
// treated ANY known ATS host as automatically the gold-standard "ats" tier
// with zero check that the specific TENANT within that host is actually
// the claimed employer — correct reasoning for a single-tenant board where
// the URL was hand-constructed from the company's own slug, but wrong for
// a raw SerpApi Google Jobs candidate, which can legitimately mix in a
// completely unrelated company's ATS-hosted listing under a broad search
// query (confirmed: this job's apply_link_resolved_at was null — never
// even went through re-resolution, this was the ORIGINAL scraped value).
// Multi-tenant ATS platforms all encode the tenant identifier somewhere
// derivable from the URL (subdomain for Workday/iCIMS/Taleo/breezy/
// recruitee, first path segment for Greenhouse/Lever/Ashby/SmartRecruiters/
// Workable) — extracted here and checked against the job's own company
// name the same fuzzy way looksLikeEmployerHost already does, so a
// mismatch downgrades out of "ats" instead of being blindly trusted.
// Returns every plausible tenant identifier for a URL, not just one — a
// real false positive caught live: Workday's SUBDOMAIN is often a short,
// cryptic abbreviation ("fil" for Fidelity Investments, "intactfc" for
// Intact Financial Corporation) while the PATH board segment right after
// it is the fuller, human-readable slug ("fidelitycanada",
// "ClioCareerSite") — checking only the subdomain false-flagged Fidelity
// Canada's own real, correct link as a mismatch. A match against EITHER
// candidate counts.
function extractAtsTenantSlugs(rawUrl: string, host: string): string[] {
  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    return [];
  }
  const segments = pathname.split("/").filter(Boolean);
  const labels = host.split(".");

  if (host.endsWith("myworkdayjobs.com")) {
    // .../{locale}/{board}/job/... or .../{board}/job/... — board is
    // whichever segment immediately precedes "job", not always index 1
    // (locale prefix isn't always present).
    const jobIdx = segments.indexOf("job");
    const board = jobIdx > 0 ? segments[jobIdx - 1] : segments[segments.length - 1];
    return [labels[0], board].filter((s): s is string => Boolean(s));
  }
  if (host.endsWith("icims.com") || host.endsWith("taleo.net") || host.endsWith("breezy.hr") || host.endsWith("recruitee.com")) {
    return labels[0] ? [labels[0]] : [];
  }
  if (host === "workable.com" || host.endsWith(".workable.com")) {
    const candidates = [];
    if (labels.length > 2 && labels[0] !== "apply" && labels[0] !== "www") candidates.push(labels[0]);
    if (segments[0]) candidates.push(segments[0]);
    return candidates;
  }
  // greenhouse.io, job-boards.greenhouse.io, lever.co, ashbyhq.com,
  // smartrecruiters.com — company slug is the first real path segment.
  // (SmartRecruiters' api.smartrecruiters.com/v1/companies/{slug}/... has
  // "v1"/"companies" ahead of it — skip those two literal segments.)
  if (host === "api.smartrecruiters.com") {
    const idx = segments.indexOf("companies");
    const slug = idx >= 0 ? segments[idx + 1] : segments[0];
    return slug ? [slug] : [];
  }
  return segments[0] ? [segments[0]] : [];
}

function atsTenantMatchesCompany(tenants: string[], company: string): boolean {
  const slugs = employerSlugs(company);
  return tenants.some((tenant) => {
    // Real false positives caught live: a Workday/Ashby/Workable tenant
    // slug is often hyphenated ("Agentis-Capital-Advisors",
    // "kingsdale-advisors") while employerSlugs() strips ALL non-
    // alphanumeric chars from the company name — comparing
    // "agentis-capital-advisors" against "agentiscapitaladvisors" never
    // matches even though they're clearly the same company. Strip the
    // same way here.
    const t = tenant.toLowerCase().replace(/[^a-z0-9]/g, "");
    return slugs.some((slug) => {
      if (slug.length < 2) return false;
      if (t === slug) return true;
      if (slug.length < 4 || t.length < 4) return false;
      return t.includes(slug) || slug.includes(t);
    });
  });
}

export function classifyApplyHost(rawUrl: string, company?: string | null): ApplyLinkTrust {
  const host = normalizedHost(rawUrl);
  if (!host) return "unverified";
  if (hostMatches(host, ATS_HOSTS)) {
    // No company to check against, or a tenant couldn't be derived from
    // this URL shape (e.g. a Taleo careersection query string this
    // extractor doesn't fully parse) — keep the original "always trust a
    // known ATS host" behavior rather than risk a false-negative downgrade.
    if (!company) return "ats";
    const tenants = extractAtsTenantSlugs(rawUrl, host);
    if (tenants.length === 0 || atsTenantMatchesCompany(tenants, company)) return "ats";
    // A real tenant WAS found and it does NOT match the claimed employer —
    // don't fall through to "employer"/"aggregator" either (this host is
    // definitely not this company's own domain); "unverified" is correct,
    // same tier a never-classified host gets, so it's still subject to
    // re-resolution and never silently trusted as the "gold standard".
  }
  if (company && looksLikeEmployerHost(host, company)) return "employer";
  if (hostMatches(host, TIER1_SAFE_AGGREGATOR_HOSTS)) return "aggregator";
  // Folded into the same "low_quality" bucket as a known Tier-2 mirror —
  // both are treated identically downstream (rerouted through Google's own
  // listing, same UI note), so there's no need for a separate trust value.
  if (hostMatches(host, TIER2_LOW_QUALITY_HOSTS) || looksLikeScamShape(rawUrl)) return "low_quality";
  return "unverified";
}

// Job-board subdomains that clearly aren't part of the brand itself
// (jobs.rbc.com's real, logo-relevant domain is rbc.com, not "jobs.rbc.com")
// — stripped before handing a domain to a logo lookup. Deliberately a short,
// conservative list: stripping the wrong label would point the logo lookup
// at a domain that doesn't exist rather than a slightly-off one.
const JOB_BOARD_SUBDOMAIN_PREFIXES = ["jobs", "careers", "career", "apply", "boards", "talent", "join", "hiring"];

// CompanyLogo.tsx's real root-cause fix (2026-08-27): the naive "strip the
// company NAME's legal suffix, lowercase it, add .com" guess is wrong for
// most real companies (Royal Bank of Canada's real domain is rbc.com, not
// royalbankofcanada.com) — confirmed live as the actual cause of most
// missing/wrong logos, not a guessing-algorithm-quality problem to iterate
// on. This instead reuses the SAME trust classification apply links already
// go through — the job's own apply URL is far more likely to be this
// company's real domain than a guess derived purely from its name string.
//
// Deliberately looser than the apply-link picker itself: "employer" (a
// string-matched, high-confidence hit) AND "unverified" both qualify here,
// not just "employer". Real live case that motivated this: RBC's real
// domain (jobs.rbc.com) never string-matches "Royal Bank of Canada" — the
// abbreviation "rbc" doesn't appear anywhere in the company name — so it
// classifies "unverified" even though it's genuinely RBC's own domain. That
// asymmetry doesn't matter for a LOGO lookup the way it does for an apply
// link: a wrong domain here just 404s through unavatar and falls through to
// the next candidate (same safety property the original naive guess always
// had), it never shows the wrong company's logo silently the way trusting
// an unverified APPLY link could mislead a candidate. "ats" (the ATS
// vendor's own domain, e.g. Greenhouse — would return Greenhouse's logo,
// not the employer's), "aggregator" (LinkedIn/Indeed — their own logo, not
// the employer's), and "low_quality" (mirror sites, no reliable per-company
// favicon) are the only tiers excluded.
export function extractLikelyLogoDomain(applyUrl: string | null | undefined, company: string | null | undefined): string | null {
  if (!applyUrl || !company) return null;
  const trust = classifyApplyHost(applyUrl, company);
  if (trust !== "employer" && trust !== "unverified") return null;

  const host = normalizedHost(applyUrl);
  if (!host) return null;

  const labels = host.split(".");
  if (labels.length > 2 && JOB_BOARD_SUBDOMAIN_PREFIXES.includes(labels[0])) {
    return labels.slice(1).join(".");
  }
  return host;
}

// Fewer tracking/affiliate params reads as closer to a direct link and
// further from a paid-per-click arbitrage redirect (agy research) — used
// only as the final tiebreaker when every candidate is unverified/low-
// quality and nothing safer exists at all.
const TRACKING_PARAM_PATTERN = /^(utm_|affid|click_id|gh_src|ref)/i;

function trackingParamCount(rawUrl: string): number {
  try {
    const params = new URL(rawUrl).searchParams;
    let count = 0;
    for (const key of params.keys()) {
      if (TRACKING_PARAM_PATTERN.test(key)) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

// Picks the best apply destination from a scraped listing's candidate URLs,
// in order of trust: a known ATS (gold standard) > a link matching the
// employer's own name > a major, safely-moderated aggregator (LinkedIn/
// Indeed/etc) > whichever remaining unverified/low-quality candidate
// carries the fewest tracking params. Never returns a Tier-2 low-quality
// mirror or an unknown domain when anything safer is available in the same
// candidate list — replaces a naive "not on a 5-host blocklist" pick, which
// let sites like workopolis.com and bebee.com through as if they were the
// employer's own page.
export function pickBestApplyLink(candidates: string[], company?: string | null): string | undefined {
  const clean = candidates.filter(Boolean);
  if (clean.length === 0) return undefined;

  // `company` is threaded into EVERY tier, including this first one — the
  // real 2026-08-30 Manulife/Tapestry bug (see classifyApplyHost's own
  // comment) was picked here, at scrape time, not by re-resolution: this
  // line used to call classifyApplyHost(url) with no company at all, which
  // hits that function's "no company to check against, trust any known ATS
  // host" guard and hands back "ats" for a completely unrelated employer's
  // posting. Fixing only the classifier would have left every FUTURE
  // scraped job hitting the same bug, since this is where a new job's
  // apply link is actually chosen (lib/jobScraper.ts already passes the
  // real company in — it just got dropped here).
  const ats = clean.find((url) => classifyApplyHost(url, company) === "ats");
  if (ats) return ats;

  if (company) {
    const employerMatch = clean.find((url) => classifyApplyHost(url, company) === "employer");
    if (employerMatch) return employerMatch;
  }

  const tier1 = clean.find((url) => classifyApplyHost(url, company) === "aggregator");
  if (tier1) return tier1;

  return clean.slice().sort((a, b) => trackingParamCount(a) - trackingParamCount(b))[0];
}
