export type NormalizedJob = {
    id: string;
    title: string;
    company: string;
    location: string;
    description: string;
    url: string;
    applyUrl?: string;
    // The full candidate list the apply-link picker chose from — persisted
    // so a
    // future classifier improvement (lib/applyLinkTrust.ts) can be
    // reapplied via a backfill against data already on hand, with zero new
    // API cost. Never discard this again (see the add-raw-apply-options
    // migration's own comment for the real gap this closes).
    rawApplyOptions?: Array<{ link?: string }>;
    salary?: string;
    type?: string;
    postedAt?: string;
    source: string;
    logoUrl?: string;
    // Carried from sources that expose them (currently the two Apify actors
    // added 2026-09-04). applicantCount is LinkedIn's own competition signal
    // ("Be among the first 25 applicants", "52 applicants") — no other source
    // wired here provides it, and it's one of the few facts that genuinely
    // changes whether a candidate should bother applying.
    applicantCount?: string;
    experienceLevel?: string;
    // Board-side hiring signals, currently from Indeed's "rich" search mode.
    // employerResponsive is the genuinely actionable one: it says whether
    // this employer actually replies to applicants, which matters more to a
    // candidate than how many others applied.
    hiringSignals?: {
        isNew?: boolean;
        employerResponsive?: boolean;
        hiringTags?: string[];
    };
};

export interface JobScraperProvider {
    search(jobTitle: string, location: string, countryCode: string, datePosted?: string): Promise<NormalizedJob[]>;
}

// SerpApi's `location` parameter must be a canonical name from its own
// Locations database. It recognizes 2-letter US state codes ("NY") but not
// Canadian province codes ("ON") — those need the full province name, or
// the request comes back as an HTTP 400 with no results.
const CANADIAN_PROVINCE_NAMES: Record<string, string> = {
    on: "Ontario", bc: "British Columbia", ab: "Alberta", qc: "Quebec",
    mb: "Manitoba", sk: "Saskatchewan", ns: "Nova Scotia", nb: "New Brunswick",
    pe: "Prince Edward Island", nl: "Newfoundland and Labrador",
    yt: "Yukon", nt: "Northwest Territories", nu: "Nunavut",
};

export function normalizeLocationForSerpApi(location: string): string {
    return location
        .split(",")
        .map((part) => CANADIAN_PROVINCE_NAMES[part.trim().toLowerCase()] ?? part.trim())
        .join(", ");
}

// SerpApi's location parameter must be an exact canonical name from its own
// Locations database — informal/regional names like "Greater Toronto Area"
// have no direct entry (confirmed empty against the locations.json API)
// even though the city itself ("Toronto") does. Strip common regional
// qualifier words and look up each candidate against the real Locations
// API rather than hardcoding a list of known regional nicknames.
export async function resolveCanonicalLocation(
    rawLocation: string,
    apiKey: string
): Promise<string | null> {
    const stripped = rawLocation
        .replace(/\b(greater|metro(?:politan)?|region)\b/gi, "")
        .replace(/\barea\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    const candidates = Array.from(
        new Set(
            [rawLocation, stripped, stripped.split(",")[0].trim(), rawLocation.split(",")[0].trim()].filter(
                (c) => c.length > 0
            )
        )
    );

    for (const candidate of candidates) {
        const params = new URLSearchParams({ q: candidate, limit: "1", api_key: apiKey });
        const response = await fetch(`https://serpapi.com/locations.json?${params.toString()}`);
        const results = await response.json();
        if (Array.isArray(results) && results[0]?.canonical_name) {
            return results[0].canonical_name as string;
        }
    }

    return null;
}







// Extracted 2026-08-31, real user-reported bug: this filter only ever ran
// on SerpApi's own raw results — direct-ATS enrichment (scraper.actions.ts)
// bypasses SerpApi entirely (it queries a company's board directly), so an
// employer's ENTIRE board (every city, every role) was landing unfiltered
// in results for any other city. Confirmed live: a "advisor"/Toronto
// search returned a wall of San Francisco/NYC engineering roles from one
// enriched company's Ashby board. Every path that can add jobs to a
// result set — SerpApi, the Adzuna thin-results supplement, and
// direct-ATS enrichment — now filters through this one function, so
// there is exactly one place city relevance is decided, not three
// separately-maintained copies of the same logic.
// A "treat any remote-looking LOCATION as location-independent" widening was
// tried here on 2026-09-03 and REVERTED the same session, because a live
// Toronto search immediately showed why it's wrong. Real leaks it produced:
// "USA, Wisconsin - Full Time Remote", "Remote-OH" and "CAN, British
// Columbia - Full Time Remote" all surfaced for a Toronto search. Most
// remote roles are not actually location-independent — they are remote
// WITHIN a country or state, and a Toronto candidate generally cannot take a
// US-locked remote job. The word "remote" in a location therefore says
// nothing reliable on its own; the accompanying geography is the part that
// matters, and parsing that correctly needs the searched country, which this
// helper doesn't receive.
//
// So the original, stricter rule stands: an explicit "anywhere" location, or
// a title that says remote (a title-level "Remote" is far more often a
// genuinely location-independent posting than a location string that merely
// contains the word). Keeping a wrong-city job out is worth more than
// catching every genuinely-remote one — that tradeoff is this function's
// entire reason for existing (see the 2026-08-31 incident above).
// Title relevance (2026-09-03, direct user report: a "Financial Advisor"
// search returned Directors, Engineers and Developers). Measured on that
// exact run: 82 visible jobs, 19 relevant — 77% noise, and 58 of the 63 bad
// ones came from Adzuna.
//
// Root cause is that most sources match on the DESCRIPTION as well as the
// title. Adzuna's `what=` is full-text, so any posting at a financial firm
// whose text mentions "financial advisors" matches — a Senior Software
// Engineer at a wealth-tech company, a Data Science intern at an asset
// manager. Workday's and iCIMS's own search params are fuzzy-relevance too,
// which is why the exemption they used to get in lib/atsRegistry.ts's
// fetchJobsForCompany was wrong (6 Workday results on that run, 1 relevant).
//
// Adzuna's own `title_only` parameter was tested as the alternative and is
// far too blunt: it collapsed the same query from 317 matches to 9. So the
// broad query is kept for supply and relevance is decided here instead,
// uniformly, for every source.
//
// The rule: reduce each significant search word to a 5-character stem and
// keep a job when ANY stem prefixes any word of its title. Stemming by
// prefix rather than a real stemmer is deliberate — it costs no dependency
// and covers the morphology that matters here (financial/finance,
// advisor/advisory, engineer/engineering). Verified against the real 82-job
// run: it dropped Software Engineer, Data Science Intern, Social Media
// Manager, IT Production Operations and Corporate Tax, while keeping every
// genuine advisor role including "Investment Advisor" and "Advisor
// Development". Finance-adjacent titles like "Chief Financial Officer" do
// survive; that's intended — they're in the right domain, and the AI's own
// scoring is the right place to rank them down, not a keyword gate.
const TITLE_STOP_WORDS = new Set(["the", "and", "for", "with", "senior", "junior", "lead", "of", "in", "at", "a", "an", "sr", "jr"]);

// Deliberately tiny and high-confidence. A broad synonym map would quietly
// undo the filter (pairing "manager" with "lead"/"supervisor" would let most
// of the noise back in); these two are near-exact equivalents that would
// otherwise cause real misses — "Software Developer" for an engineer search,
// and the British "adviser" spelling.
const TITLE_SYNONYM_GROUPS = [
  ["engineer", "developer", "programmer"],
  ["advisor", "adviser"],
];

function titleStems(searchTitle: string): string[] {
  const words = searchTitle
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !TITLE_STOP_WORDS.has(w));

  const expanded = new Set<string>();
  for (const word of words) {
    expanded.add(word);
    for (const group of TITLE_SYNONYM_GROUPS) {
      if (group.some((member) => word.startsWith(member.slice(0, 5)))) {
        for (const member of group) expanded.add(member);
      }
    }
  }
  return [...expanded].map((w) => w.slice(0, 5));
}

export function matchesSearchTitle(searchTitle: string, jobTitle: string | undefined): boolean {
  const stems = titleStems(searchTitle);
  if (stems.length === 0) return true;
  const words = (jobTitle ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return false;
  return stems.some((stem) => words.some((word) => word.startsWith(stem)));
}

export function filterByTitleRelevance<T extends { title?: string }>(jobs: T[], searchTitle: string): T[] {
  if (!searchTitle.trim()) return jobs;
  return jobs.filter((job) => matchesSearchTitle(searchTitle, job.title));
}

export function filterByCity<T extends { location?: string; title?: string }>(jobs: T[], location: string): T[] {
    const searchCity = location.split(",")[0].trim().toLowerCase();
    if (!searchCity) return jobs;
    return jobs.filter((job) => {
        const jobLocation = (job.location || "").toLowerCase();
        const jobTitle = (job.title || "").toLowerCase();
        return (
            jobLocation.includes(searchCity) ||
            jobLocation === "anywhere" ||
            /\bremote\b/.test(jobTitle)
        );
    });
}















// Adzuna's own structured job-board API — real, direct listings (not a
// Google Jobs scrape), confirmed live 2026-08-30 against the exact
// ADZUNA_APP_ID/ADZUNA_APP_KEY already in .env. Country codes differ from
// SerpApi's own convention (lowercase 2-letter path segment, e.g. /ca/) —
// mapped directly since this app's own countryCode param already matches
// that shape.
type AdzunaJobResult = {
    id: string;
    title?: string;
    company?: { display_name?: string };
    location?: { display_name?: string };
    description?: string;
    redirect_url?: string;
    created?: string;
    contract_time?: string;
    salary_min?: number;
    salary_max?: number;
};

function getAdzunaCredentials(): { appId: string; appKey: string } | null {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    return appId && appKey ? { appId, appKey } : null;
}

// Raised 3 -> 8 pages and fetched in PARALLEL (2026-09-03), after a user
// screenshot of a real "Financial Advisor"/Toronto search showed only 21
// results on screen. The 3-page cap was the single biggest cause: Adzuna
// reported 317 matches for that query, and paging all the way through them
// yields 118 genuinely title-relevant jobs — but 3 pages only ever saw 150
// raw rows, roughly 54 relevant, which then shrank further through dedup,
// the city filter and canonicalisation.
//
// The old cap was chosen to "roughly match SerpApi's ~100-result ceiling",
// which stopped making sense once SerpApi went to zero and Adzuna became the
// primary supplier rather than a supplement. These are free-tier credentials
// and the requests cost nothing.
//
// Parallel, not sequential: the old loop awaited each page in turn and
// early-exited on a short page, so 7 pages meant 7 round-trips end to end.
// Fetching them concurrently makes the whole set cost about one page's
// latency. Pages past the end simply return empty and are ignored, which is
// what replaces the early-exit.
const ADZUNA_PAGES = 8;
const ADZUNA_PER_PAGE = 50;

// Adzuna's index genuinely carries long-dead listings alongside fresh
// ones — measured, not assumed: a real 50-result sample for "advisor" in
// Toronto (2026-08-31) was 62% from the current month but still included
// two postings from July 2024, over two years old. Unlike Google Jobs
// (which prunes aggressively), Adzuna will happily return those, and a
// candidate tailoring a résumé for a two-year-dead posting is a real
// waste of their effort. This is a cheap first-pass exclusion at ingestion
// (avoids ever inserting an obviously-dead listing at all) — the real,
// uniform staleness bar every source goes through regardless is
// lib/jobPreFilter.ts's MAX_POSTING_AGE_DAYS (60 days as of 2026-09-01,
// direct user request) — kept in sync with that number rather than picked
// independently, so there's one staleness policy, not two.
const ADZUNA_MAX_AGE_DAYS = 60;

function isRecentEnough(created: string | undefined, maxAgeDays: number): boolean {
    if (!created) return true; // No date given is not evidence of staleness.
    const ts = Date.parse(created);
    if (Number.isNaN(ts)) return true;
    return Date.now() - ts <= maxAgeDays * 24 * 60 * 60 * 1000;
}

const adzunaProvider: JobScraperProvider = {
    async search(jobTitle, location, countryCode) {
        const creds = getAdzunaCredentials();
        if (!creds) throw new Error("Missing ADZUNA_APP_ID/ADZUNA_APP_KEY");

        const pageUrl = (page: number) =>
            `https://api.adzuna.com/v1/api/jobs/${countryCode.toLowerCase()}/search/${page}?app_id=${creds.appId}&app_key=${creds.appKey}&what=${encodeURIComponent(jobTitle)}&where=${encodeURIComponent(location)}&results_per_page=${ADZUNA_PER_PAGE}&content-type=application/json`;

        // Page 1 is awaited on its own so a genuine credential/quota failure
        // still surfaces as a real error rather than being swallowed as "no
        // results" — the same distinction the old sequential loop drew, kept
        // deliberately. Later pages are best-effort: past the end of the
        // result set they simply come back empty.
        const firstResponse = await fetch(pageUrl(1));
        if (!firstResponse.ok) {
            const bodyText = await firstResponse.text().catch(() => "");
            throw new Error(`Adzuna API error (HTTP ${firstResponse.status}): ${bodyText.slice(0, 300)}`);
        }
        const firstJson = await firstResponse.json();
        const firstPage: AdzunaJobResult[] = firstJson.results ?? [];

        const jobs: AdzunaJobResult[] = [...firstPage];
        // Only bother with the rest when page 1 came back full — a short
        // first page means there is no page 2, so this keeps narrow queries
        // at exactly one request.
        if (firstPage.length >= ADZUNA_PER_PAGE) {
            const rest = await Promise.all(
                Array.from({ length: ADZUNA_PAGES - 1 }, (_, i) =>
                    fetch(pageUrl(i + 2))
                        .then((res) => (res.ok ? res.json() : null))
                        .then((json) => (json?.results ?? []) as AdzunaJobResult[])
                        .catch(() => [] as AdzunaJobResult[]),
                ),
            );
            for (const pageJobs of rest) jobs.push(...pageJobs);
        }

        return jobs
            .filter((job) => isRecentEnough(job.created, ADZUNA_MAX_AGE_DAYS))
            .map((job) => ({
            id: `adzuna-${job.id}`,
            title: job.title ?? "",
            company: job.company?.display_name ?? "",
            location: job.location?.display_name ?? "",
            description: job.description ?? "",
            url: job.redirect_url ?? "",
            applyUrl: job.redirect_url,
            salary: job.salary_min && job.salary_max ? `$${Math.round(job.salary_min)} - $${Math.round(job.salary_max)}` : undefined,
            type: job.contract_time,
            postedAt: job.created,
            source: "Adzuna",
        }));
    },
};

// Careerjet was researched this session (Phase 43/44) and, unlike RemoteOK
// below, is deliberately NOT wired in — a real live-verification finding,
// not an oversight. The legacy `public.api.careerjet.net/search` endpoint
// (what most third-party writeups still describe as "keyless") returned
// real results with `Referer: https://example.com`, but a genuine 401 —
// `"The legacy Job Search API is only accessible for authenticated legacy
// users. Please use the new API (v4) instead"` — with this app's own real
// referrer, confirmed reproducibly (2026-09-03). example.com evidently sits
// on some grandfathered legacy allowlist; shipping code that only works by
// presenting a fake referrer identity would be dishonest and could stop
// working the moment Careerjet tightens that allowlist further. Their own
// current partner docs (careerjet.com/partners/api) confirm the real,
// current API requires a registered Publisher account and an API key used
// as an HTTP Basic Auth username — account creation this app can't do on
// the user's behalf, same real blocker as PayPal Payouts (see RESUME.md).
// Re-verify the same way (a real fetch against this app's own domain, not
// just a docs read) if this is ever revisited once a real Publisher key
// exists.





// Arbeitnow was researched and its real API/field shape confirmed via
// WebFetch (2026-08-30, keyless/public, title/company_name/location/url/
// remote/job_types) — but a direct live fetch immediately afterward failed
// with a real, persistent TLS certificate mismatch: www.arbeitnow.com's
// current certificate is issued for a completely different domain
// (preiswecker.com), reproduced 3/3 retries, not a transient blip. Per this
// project's own established rule (SmartRecruiters/Workable were dropped
// after failing live verification during the ATS-adapter work), a provider
// that fails live verification does not ship — deliberately not wired in
// here. Re-verify the same way (a real fetch, not just a docs read) before
// ever adding this back; disabling TLS verification to work around a cert
// mismatch is not an acceptable fix.

// Apify (misceres/indeed-scraper) — last-resort tier, real per-result cost
// ($0.005/result, confirmed live 2026-08-30 via the actor's own pricing
// info), only reached once every free/already-paid-for tier above is
// exhausted. Actor chosen after live-verifying it directly (2M+ real runs,
// last run the same day as this check) rather than guessing an actor id —
// same standard this project's ATS-adapter work already established
// (SmartRecruiters/Workable were tried and dropped after failing that
// same live-verification bar).
type ApifyIndeedJobResult = {
    id?: string;
    positionName?: string;
    company?: string;
    location?: string;
    description?: string;
    url?: string;
    externalApplyLink?: string;
    jobType?: string[];
    salary?: string;
    postingDateParsed?: string;
};

function getApifyToken(): string | null {
    return process.env.APIFY_API_TOKEN || null;
}

// DORMANT, not deleted (2026-09-04, direct user decision: "we are not
// using them for now"). Kept defined, tested and credential-gated so
// re-enabling is a one-line push into searchJobs's sources array rather
// than a rewrite. The disable is deliberate: an unused-warning left
// standing forever trains everyone to ignore this file's lint output,
// which is how the SerpApi providers sat dead here unnoticed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const apifyProvider: JobScraperProvider = {
    async search(jobTitle, location, countryCode) {
        const token = getApifyToken();
        if (!token) throw new Error("Missing APIFY_API_TOKEN");

        const response = await fetch(
            `https://api.apify.com/v2/acts/misceres~indeed-scraper/run-sync-get-dataset-items?token=${token}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    position: jobTitle,
                    location,
                    country: countryCode.toUpperCase(),
                    maxItemsPerSearch: 25,
                }),
            },
        );

        if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            throw new Error(`Apify API error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const jobs: ApifyIndeedJobResult[] = await response.json();

        return jobs.map((job) => ({
            id: `apify-indeed-${job.id}`,
            title: job.positionName ?? "",
            company: job.company ?? "",
            location: job.location ?? "",
            description: job.description ?? "",
            url: job.url ?? "",
            applyUrl: job.externalApplyLink || job.url,
            salary: job.salary,
            type: job.jobType?.[0],
            postedAt: job.postingDateParsed,
            source: "Indeed (via Apify)",
        }));
    },
};

// Two PAID Apify actors, added 2026-09-04 after live-testing five candidates
// against the same real query. Both are deliberately capped and env-gated,
// because unlike every free source above these spend real money per result.
//
// Why these two rather than an all-in-one: `truefetch/job-search` covers 42
// sources in a single call and looked like the obvious answer, but measured
// against the others it was 45x the price of kaix, by far the slowest
// (160s+, aborted), and weakest exactly where this product needs strength —
// only 3 ATS platforms, fewer than the 8 lib/proactiveAtsCrawl.ts already
// crawls for free. Two specialists beat one generalist here:
//
//   kaix (LinkedIn)  — the volume and freshness source. LinkedIn is this
//     pipeline's single largest blind spot: its public API is partner-only,
//     so before this we had ZERO LinkedIn coverage. Measured: 100 results in
//     47s for "Financial Advisor"/Toronto, every one a genuine advisor role,
//     with applicant counts ("Be among the first 25", "52 applicants"),
//     recruiter profiles and company logos. At $0.0001/result it is 12x
//     cheaper than the Indeed actor this file already calls.
//
//   hirebase (ATS)   — the link-quality source. Returns DIRECT employer
//     links (rbc.wd3.myworkdayjobs.com, jobs.scotiabank.com) rather than
//     aggregator redirects, plus real structured salary ranges, visa
//     sponsorship and staffing-agency flags. Also reaches SuccessFactors,
//     which this codebase's own crawler does not cover. Slower per dollar
//     ($0.003/result) but 2.5s per call and very high value per row.
//
// Item caps are the cost control and are deliberately conservative: at these
// defaults one search costs about $0.01 (kaix) + $0.06 (hirebase). Raise
// APIFY_LINKEDIN_MAX_ITEMS / APIFY_HIREBASE_MAX_ITEMS once a real budget
// exists; set them to 0 to switch either source off without a deploy.
function apifyItemCap(envVar: string, fallback: number): number {
    const raw = Number(process.env[envVar]);
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

type KaixLinkedInJob = {
    jobId?: string;
    title?: string;
    company?: string;
    location?: string;
    jobUrl?: string;
    postedDate?: string;
    postedTimeAgo?: string;
    applicants?: string;
    experienceLevel?: string;
    employmentType?: string;
    salary?: string;
    description?: string;
    companyLogoUrl?: string;
};

// kaix/indeed-scraper (2026-09-04). Chosen after surveying ~60 job actors
// across the Apify store plus an independent agy pass over the pricing
// models the store listings do not expose (compute-unit and monthly-rental
// actors, which work out at $0.20-$0.75/1k once residential proxy bandwidth
// is counted). Nothing came close.
//
//   kaix/indeed      $0.00005/job = $0.05 per 1,000   <- this
//   kaix/linkedin    $0.0001/job  = $0.10 per 1,000
//   next cheapest    $0.0007/job  = $0.70 per 1,000
//   multi-board      $0.00225/job = $2.25 per 1,000
//
// Two things measured live on a real "Financial Advisor"/Toronto run before
// wiring this in, both of which matter more than the price:
//
// 1. DESCRIPTIONS ARE FULL. min 3,727 / median 5,145 / max 8,452 chars,
//    0 of 30 under 150. So Indeed needs NO jobPreFilter exemption -- unlike
//    LinkedIn, where 78 of 82 rows fall under that bar and survive only
//    because "linkedin" is on the exemption list. Checking this BEFORE
//    shipping is deliberate: that one rule has now silently swallowed two
//    entire sources on arrival.
// 2. APPLY LINKS POINT AT THE EMPLOYER. urls.external / apply.url resolve to
//    the company's own ATS (e.g. careers.southwire.com), not an Indeed
//    redirect -- which is the whole basis of this product's link quality.
//
// searchMode "basic" is deliberate: 30 jobs in 3.7s. "rich" adds
// signals.applyCount (Indeed's applicant count) but caps at ~450 results and
// is slower; revisit only if that badge is wanted on the card.
type KaixIndeedJob = {
    id?: string;
    title?: { text?: string };
    urls?: { indeed?: string; external?: string; apply?: string };
    apply?: { url?: string };
    description?: { text?: string; html?: string };
    company?: { name?: string };
    location?: { formatted?: string };
    dates?: { posted?: string };
    salary?: { text?: string | null };
    classification?: { jobType?: string[] };
    signals?: { isNew?: boolean | null; employerResponsive?: boolean | null; hiringTags?: string[] | null };
};

// The actor takes an uppercase ISO country from a fixed enum; this app
// passes lowercase codes around. "gb" is the one that does not round-trip --
// Indeed's enum calls it UK.
function indeedCountryCode(countryCode: string): string {
    const upper = (countryCode || "ca").toUpperCase();
    return upper === "GB" ? "UK" : upper;
}

const apifyIndeedProvider: JobScraperProvider = {
    async search(jobTitle, location, countryCode) {
        const token = getApifyToken();
        if (!token) throw new Error("Missing APIFY_API_TOKEN");
        const maxItems = apifyItemCap("APIFY_INDEED_MAX_ITEMS", 100);
        if (maxItems === 0) return [];

        const response = await fetch(
            `https://api.apify.com/v2/acts/kaix~indeed-scraper/run-sync-get-dataset-items?token=${token}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    keyword: jobTitle,
                    location,
                    country: indeedCountryCode(countryCode),
                    maxItems,
                    sort: "relevance",
                    // "rich" rather than "basic" (2026-09-04). It adds
                    // signals.employerResponsive, signals.isNew and
                    // hiringTags, and measurement showed it costs nothing in
                    // wall-clock terms: 100 jobs in 9.6s against the LinkedIn
                    // actor's ~43s, and the two run concurrently, so Indeed
                    // still finishes comfortably first.
                    //
                    // signals.applyCount stays null in rich mode -- Indeed
                    // does not expose an applicant count here, so the
                    // long-standing "applicant count on the card" item is
                    // still not satisfied by this source either.
                    // employerResponsive is arguably the better signal
                    // anyway: whether an employer actually replies matters
                    // more to a candidate than how many others applied.
                    searchMode: "rich",
                }),
            },
        );

        if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            throw new Error(`Apify Indeed error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const jobs: KaixIndeedJob[] = await response.json();
        return jobs
            .filter((job) => job.id && job.title?.text)
            .map((job) => ({
                id: `indeed-${job.id}`,
                title: job.title?.text ?? "",
                company: job.company?.name ?? "",
                location: job.location?.formatted ?? "",
                description: job.description?.text ?? "",
                url: job.urls?.indeed ?? "",
                // Employer ATS link first, Indeed's own page only as a last
                // resort -- pickBestApplyLink/classifyApplyHost downstream
                // rank a real employer host above an aggregator anyway, but
                // handing them the good one directly avoids a rescue pass.
                applyUrl: job.apply?.url || job.urls?.external || job.urls?.indeed,
                salary: job.salary?.text || undefined,
                type: job.classification?.jobType?.[0] || undefined,
                postedAt: job.dates?.posted,
                source: "Indeed",
                // Indeed's own hiring signals, carried through for the UI.
                hiringSignals: {
                    isNew: job.signals?.isNew ?? undefined,
                    employerResponsive: job.signals?.employerResponsive ?? undefined,
                    hiringTags: job.signals?.hiringTags?.length ? job.signals.hiringTags : undefined,
                },
            }));
    },
};

const apifyLinkedInProvider: JobScraperProvider = {
    async search(jobTitle, location) {
        const token = getApifyToken();
        if (!token) throw new Error("Missing APIFY_API_TOKEN");
        const maxJobs = apifyItemCap("APIFY_LINKEDIN_MAX_ITEMS", 100);
        if (maxJobs === 0) return [];

        const response = await fetch(
            `https://api.apify.com/v2/acts/kaix~linkedin-jobs-scraper/run-sync-get-dataset-items?token=${token}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    keywords: jobTitle,
                    location,
                    maxJobs,
                    // Detail enrichment ON (2026-09-04, direct user request).
                    // This is the ONLY way LinkedIn's applicant count, full
                    // description, recruiter profile, benefits and structured
                    // criteria are populated — without it those fields exist
                    // in the schema but come back empty, which a live run
                    // confirmed (74 rows, 0 applicant counts).
                    //
                    // It is genuinely expensive in TIME, not money: measured
                    // at roughly 17s per job (6 results in 106s), against
                    // ~0.5s per job with details off. APIFY_LINKEDIN_MAX_ITEMS
                    // is therefore the latency dial as much as the cost dial —
                    // keep it small while details are on, or move this source
                    // to the background crawl where slowness doesn't matter.
                    // Defaults to FALSE, and that default is load-bearing.
                    // An earlier version defaulted to true, so any
                    // environment missing this variable silently took the
                    // ~17s-per-job path and blew the 300s API ceiling —
                    // returning ZERO results after a 300s wait. Caught when a
                    // Doppler-injected run (which has no .env) timed out
                    // exactly that way. The expensive path must be opted
                    // into explicitly, never fallen into by omission.
                    fetchDetails: process.env.APIFY_LINKEDIN_FETCH_DETAILS === "true",
                    datePosted: "past_month",
                    sortBy: "recent",
                }),
            },
        );

        if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            throw new Error(`Apify LinkedIn error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const jobs: KaixLinkedInJob[] = await response.json();
        return jobs
            .filter((job) => job.jobId && job.title)
            .map((job) => ({
                id: `linkedin-${job.jobId}`,
                title: job.title ?? "",
                company: job.company ?? "",
                location: job.location ?? "",
                description: job.description ?? "",
                url: job.jobUrl ?? "",
                applyUrl: job.jobUrl,
                salary: job.salary || undefined,
                type: job.employmentType || undefined,
                postedAt: job.postedDate,
                source: "LinkedIn",
                logoUrl: job.companyLogoUrl,
                // Real competitive signal no other source here provides —
                // LinkedIn's own applicant count ("Be among the first 25
                // applicants", "52 applicants"). Carried through so the UI
                // can show it; see NormalizedJob.applicantCount.
                applicantCount: job.applicants || undefined,
                experienceLevel: job.experienceLevel || undefined,
            }));
    },
};

type HirebaseJob = {
    id?: string;
    jobTitle?: string;
    companyName?: string;
    location?: string;
    applicationLink?: string;
    datePosted?: string;
    jobType?: string;
    experienceLevel?: string;
    descriptionText?: string;
    companyLogo?: string;
    recruiterAgency?: boolean;
    salaryRange?: { min?: number; max?: number; currency?: string };
};

// DORMANT, not deleted (2026-09-04, direct user decision: "we are not
// using them for now"). Kept defined, tested and credential-gated so
// re-enabling is a one-line push into searchJobs's sources array rather
// than a rewrite. The disable is deliberate: an unused-warning left
// standing forever trains everyone to ignore this file's lint output,
// which is how the SerpApi providers sat dead here unnoticed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const apifyHirebaseProvider: JobScraperProvider = {
    async search(jobTitle, location) {
        const token = getApifyToken();
        if (!token) throw new Error("Missing APIFY_API_TOKEN");
        const maxItems = apifyItemCap("APIFY_HIREBASE_MAX_ITEMS", 20);
        if (maxItems === 0) return [];

        const response = await fetch(
            `https://api.apify.com/v2/acts/hirebase~job-search/run-sync-get-dataset-items?token=${token}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jobTitles: [jobTitle],
                    locations: [location],
                    postedWithinDays: 30,
                    maxItems,
                }),
            },
        );

        if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            throw new Error(`Apify hirebase error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const jobs: HirebaseJob[] = await response.json();
        return jobs
            .filter((job) => job.jobTitle && job.applicationLink)
            // Staffing agencies are already hidden downstream by
            // lib/jobPreFilter.ts's own name list; this source states it as a
            // real flag, so drop them before they ever cost an evaluation.
            .filter((job) => !job.recruiterAgency)
            .map((job) => {
                const range = job.salaryRange;
                const salary =
                    range?.min && range?.max
                        ? `${range.currency ?? "$"}${Math.round(range.min).toLocaleString()} - ${Math.round(range.max).toLocaleString()}`
                        : undefined;
                return {
                    id: `hirebase-${job.id}`,
                    title: job.jobTitle ?? "",
                    company: job.companyName ?? "",
                    location: job.location ?? "",
                    description: job.descriptionText ?? "",
                    // Already the employer's own ATS posting, so it needs no
                    // rescue pass — classifyApplyHost will read it as "ats".
                    url: job.applicationLink ?? "",
                    applyUrl: job.applicationLink,
                    salary,
                    type: job.jobType || undefined,
                    postedAt: job.datePosted,
                    source: "Employer ATS",
                    logoUrl: job.companyLogo,
                    experienceLevel: job.experienceLevel || undefined,
                };
            });
    },
};

// Same title+company job legitimately appears in more than one provider's
// index; keyed on both since neither URL nor id is comparable across
// providers. This is a cheap in-request dedup pass before canonicalization
// ever sees the data — canonicalizeJobSources' own 3-tier match handles
// the real, durable dedup, but there's no reason to hand it two obviously
// identical hits when a plain title+company check already catches them.
function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
    const seen = new Set<string>();
    const out: NormalizedJob[] = [];
    for (const job of jobs) {
        const key = `${(job.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${(job.company ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim()}`;
        if (key === "|" || seen.has(key)) continue;
        seen.add(key);
        out.push(job);
    }
    return out;
}

// Real regression found live (2026-09-01, direct user pushback): Adzuna
// used to only get queried when SerpApi's OWN result count looked "thin"
// (< 25) — but SerpApi's count says nothing about how much real supply
// exists elsewhere. Confirmed with real data the same day: SerpApi found
// 33 "Financial Advisor"/Toronto results (comfortably clearing the old
// 25-result threshold, so Adzuna was never even queried) while a direct
// Adzuna call for the identical search found 267. Gating a second free
// source behind the first source's own count was leaving most of the real
// supply on the table whenever SerpApi happened to clear an arbitrary bar.
// Now runs unconditionally, every search, CONCURRENTLY with SerpApi (not
// sequentially after it) — the two calls don't depend on each other, so
// there's no reason to pay both latencies back-to-back. Safe to merge them
// now that canonicalizeJobSources' 3-tier match + source-priority merge
// (Phase 1, 2026-08-31) reliably collapses genuine duplicates between the
// two sources instead of just accumulating separate rows the way the
// pre-canonicalization pipeline would have. TheirStack/Apify stay reserved
// for genuine SerpApi quota exhaustion — TheirStack burns paid per-search
// credits and Apify costs real money per result, neither is a "run it
// every time for free" source the way Adzuna is.
// Consistency fix (Phase 43/44, direct user decision): Adzuna's own merge
// used to swallow ANY failure (network blip, a transient 5xx) straight to an
// empty array on the first try — meaning one bad request silently dropped
// Adzuna's real supply for that entire search, even though a second attempt
// moments later would likely have succeeded (Adzuna has no shared-quota
// exhaustion concept the way SerpApi does, so a failure here is almost
// always transient, not a genuine "this source is out"). One retry, after a
// short pause, before finally giving up and returning SerpApi's results
// alone — same "retry once, then fall back" shape lib/evaluator.ts's own
// lite-evaluation JSON-parse retry already uses.
// DORMANT while Adzuna is paused (see searchJobs). Kept with its retry
// behaviour intact -- a transient Adzuna error used to drop straight to an
// empty result for the whole search, and that fix should survive the pause.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function searchAdzunaWithRetry(jobTitle: string, location: string, countryCode: string): Promise<NormalizedJob[]> {
    try {
        return await adzunaProvider.search(jobTitle, location, countryCode);
    } catch (err) {
        console.warn("[jobScraper] Adzuna failed, retrying once", err);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return adzunaProvider.search(jobTitle, location, countryCode);
    }
}

// RemoteOK (Phase 43/44, direct user decision, "Part A" remaining items)
// joins Adzuna in this same always-on concurrent merge — genuinely
// keyless/free (no shared quota to protect, no per-key exhaustion concept),
// so there's no reason to gate it behind SerpApi's own result count any
// more than Adzuna already isn't (see this function's original 2026-09-01
// regression comment above). Careerjet was researched alongside it but is
// NOT included here — see the comment above stripHtml for why (its free
// endpoint turned out to require a fake referrer identity to pass, a real
// account is genuinely required). RemoteOK's own results skip filterByCity
// entirely (see remoteOkProvider's own comment — every result is inherently
// remote by construction).
// SOURCE SET (2026-09-04, direct user decision): Adzuna + Apify LinkedIn +
// this app's own ATS layer. SerpApi, JSearch, JobsPipe, RemoteOK and
// TheirStack are no longer part of the product -- not switched off pending a
// quota reset, dropped.
//
// The third leg is not in this file: reactive direct-ATS enrichment and the
// proactive crawl cache both live in lib/actions/scraper.actions.ts and run
// after searchJobs returns. They are the largest source by volume (386,751
// cached postings across 8 ATS platforms) and the origin of this product's
// best apply-link authenticity, so "two sources" here understates the real
// pipeline considerably.
//
// Every source is a PEER. There is deliberately no primary. The previous
// shape treated SerpApi as primary and merged the rest into it, which is
// exactly how a single provider's rejection discarded every other source's
// already-fetched (and, for the paid ones, already-billed) results. Each
// entry below is caught independently; one dead source can never take the
// others down with it.
export async function searchJobs(
    jobTitle: string,
    location: string,
    countryCode: string = "ca",
    provider: "serpapi" = "serpapi",
    datePosted?: string,
    // Fires as each source resolves, BEFORE the slowest one finishes
    // (2026-09-05). Providers run concurrently but were only ever reported
    // together, so a search's visible latency was the slowest provider's --
    // Indeed answers in ~10s and then sat unused while LinkedIn took ~45s.
    // The caller uses this to put each source's results on screen as they
    // land. Never allowed to affect the search: it is called inside a
    // try/catch and its return value is ignored.
    onSourceResults?: (sourceName: string, jobs: NormalizedJob[]) => void,
): Promise<NormalizedJob[]> {
    void provider;
    void datePosted;

    // Credential-gated per source, and NOT a hard failure: with more than
    // one source configured, a single missing or rotated key must degrade
    // the search, never abort it. Only a total absence of configured
    // sources is a real error worth throwing on.

    // hirebase deliberately NOT called here (2026-09-04). Two independent
    // research passes reached the same conclusion, and it matches what we
    // measured: at $3.00/1k it is ~30x the LinkedIn per-result price, and it
    // largely duplicates what lib/proactiveAtsCrawl.ts already collects for
    // free — 386,751 cached postings across 8 ATS platforms, which is also
    // where this product's best link authenticity already comes from. Its
    // genuine additions (SuccessFactors/Oracle coverage, parsed salary and
    // visa flags) are not worth 30x while a free equivalent exists. The
    // provider stays defined and tested for the day that changes.
    const sources: Array<{ name: string; promise: Promise<NormalizedJob[]> }> = [];

    if (getApifyToken()) {
        // LinkedIn results are already location-scoped by the actor's own
        // `location` input, so no filterByCity pass here.
        sources.push({ name: "LinkedIn", promise: apifyLinkedInProvider.search(jobTitle, location, countryCode) });
        // Indeed is scoped by its own location + radius inputs, same as
        // LinkedIn, so it needs no filterByCity pass either. Verified live:
        // a Toronto search returned Toronto-area rows only.
        sources.push({ name: "Indeed", promise: apifyIndeedProvider.search(jobTitle, location, countryCode) });
    }

    // Adzuna PAUSED (2026-09-04, direct user decision: "for now pause the
    // adzuna as well"), dormant rather than deleted, same posture as the two
    // Apify providers above.
    //
    // Measured on a real "Financial Advisor"/Toronto run immediately before
    // this: Adzuna contributed 219 of 289 unique results -- the larger source
    // by volume. Pausing it is a deliberate trade of breadth for speed, and
    // the saving is mostly DOWNSTREAM rather than in the fetch: those 219
    // extra rows each cost an apply-link verification round trip, a
    // canonicalization upsert, and a share of the evaluation chunks.
    //
    // Re-enabling is one push into `sources` with the filterByCity wrapper
    // that used to be here (Adzuna's own `where=` filters server-side, but
    // this app keeps exactly one function deciding city relevance).

    if (sources.length === 0) {
        throw new Error("No job source is configured — set APIFY_API_TOKEN and/or ADZUNA_APP_ID/ADZUNA_APP_KEY.");
    }

    const settled = await Promise.all(
        sources.map(({ name, promise }) =>
            promise
                .then((jobs) => {
                    if (onSourceResults && jobs.length > 0) {
                        try {
                            onSourceResults(name, jobs);
                        } catch (err) {
                            // A reporting failure must never fail the search.
                            console.error(`[jobScraper] onSourceResults(${name}) threw`, err);
                        }
                    }
                    return jobs;
                })
                .catch((err) => {
                    console.error(`[jobScraper] ${name} failed`, err);
                    return [] as NormalizedJob[];
                }),
        ),
    );

    settled.forEach((jobs, i) => console.warn(`[jobScraper] ${sources[i].name} contributed ${jobs.length} result(s).`));
    return dedupeJobs(settled.flat());
}