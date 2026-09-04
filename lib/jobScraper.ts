import { pickBestApplyLink } from "@/lib/applyLinkTrust";

// Shape of a single entry in SerpApi's Google Jobs `jobs_results` array.
// Only the fields this file actually reads — SerpApi returns many more.
type SerpApiJobResult = {
    job_id: string;
    title?: string;
    company_name?: string;
    location?: string;
    description?: string;
    share_link?: string;
    apply_options?: Array<{ link?: string }>;
    detected_extensions?: {
        salary?: string;
        schedule_type?: string;
        posted_at?: string;
    };
    // Google Jobs' own resolved employer logo, when it has one — real data
    // from the API we already call, not a guess. Absent for some listings.
    thumbnail?: string;
};

export type NormalizedJob = {
    id: string;
    title: string;
    company: string;
    location: string;
    description: string;
    url: string;
    applyUrl?: string;
    // The full candidate list pickApplyUrl chose from — persisted so a
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
};

// Google Jobs listings via SerpApi carry a `share_link` (a google.com/search
// deep link back into the Google Jobs UI, not a real application page) plus
// an `apply_options` array of real destinations — the employer's own ATS
// posting when one exists, plus third-party boards and, frequently, low-
// quality job-board mirrors or SEO-farm scrapers. Selection logic lives in
// lib/applyLinkTrust.ts (see its own comment for the full rationale — a
// naive "not on a 5-host blocklist" pick previously let sites like
// workopolis.com and bebee.com through as if they were the employer's own
// page, confirmed live against ~23% of this app's real scraped dataset).
function pickApplyUrl(applyOptions: Array<{ link?: string }> | undefined, company: string | undefined): string | undefined {
    if (!applyOptions || applyOptions.length === 0) return undefined;
    const links = applyOptions.map((option) => option.link).filter((link): link is string => Boolean(link));
    return pickBestApplyLink(links, company);
}

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

// Real, structural bug found live (2026-09-01, direct user question — "I
// need the same as SerpApi and others who cover the global market but not
// limited to Canada and USA"): every call site of searchJobs() hardcoded
// countryCode to "ca", regardless of what location the candidate actually
// typed — meaning a search for "London, UK" or "Berlin, Germany" was
// silently told to search CANADA (SerpApi's `gl` param AND, worse,
// Adzuna's own per-country endpoint literally becomes
// api.adzuna.com/v1/api/jobs/ca/search/..., the Canada-only Adzuna
// database, for every search regardless of the real target country). This
// isn't a missing-provider gap — SerpApi's google_jobs engine and Adzuna
// both already support dozens of countries; the pipeline just never told
// them which one. Resolved here via the SAME SerpApi Locations API
// resolveCanonicalLocation already uses, which returns a real
// `country_code` per result (confirmed live: "London" correctly resolves
// to GB/CA/US depending on which London) — and confirmed live that this
// endpoint does NOT consume search quota (it returned real data even
// against a key already at 0/250 for the month), so this costs nothing
// beyond one extra fetch per search.
async function resolveCountryCodeForLocation(rawLocation: string, apiKey: string): Promise<string | null> {
    const primaryCity = rawLocation.split(",")[0].trim();
    if (!primaryCity) return null;
    try {
        const params = new URLSearchParams({ q: primaryCity, limit: "1", api_key: apiKey });
        const response = await fetch(`https://serpapi.com/locations.json?${params.toString()}`);
        const results = await response.json();
        if (Array.isArray(results) && typeof results[0]?.country_code === "string") {
            return (results[0].country_code as string).toLowerCase();
        }
    } catch (err) {
        console.warn(`[jobScraper] country-code resolution failed for "${rawLocation}"`, err);
    }
    return null;
}

// SerpApi returns HTTP 200 + a `data.error` string for both "out of
// searches this month" and unrelated issues (bad location, etc) — there's
// no distinct status code to key off, so detect quota exhaustion by the
// error text itself. Only this class of failure should burn a fallback
// key; a real "no results for this query" shouldn't retry on a second key.
function isQuotaExhaustedError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    // Broadened 2026-09-01 for JSearch/OpenWeb Ninja's own real error
    // phrasing (confirmed live: "You are not subscribed to this API",
    // HTTP 403, before the user activated the API on their dashboard —
    // and the same phrasing would recur if PAYG billing itself lapses).
    // Folding "not subscribed"/402/403 into the SAME "treat as exhausted,
    // try the next fallback tier" path is the safe choice either way: a
    // genuinely mis-configured tier degrading gracefully to the next one
    // is strictly better than it crashing the whole search.
    return /run out of searches|out of searches|monthly limit|plan.*limit|not subscribed|quota|insufficient credit|429|402|403/i.test(message);
}

// SerpApi reports a genuine zero-match query as a `data.error` string
// rather than an empty jobs_results array — that's a real, legitimate
// search outcome (see agy research, Phase 11), not a failure. Only this
// specific phrasing should collapse to an empty result set; any other
// error (auth, network, malformed request) still needs to surface as one.
function isNoResultsError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return /hasn't returned any results/i.test(message);
}

// SerpApi's google_jobs engine takes recency as a `chips` value rather than
// a separate parameter — passing it here narrows the search itself instead
// of fetching everything and discarding stale postings client-side (Phase 11
// filter-bar rebuild, agy research: "highly recommended to pass Date Posted
// to SerpApi directly to avoid fetching stale jobs just to filter them
// down").
const DATE_POSTED_CHIPS: Record<string, string> = {
    today: "date_posted:today",
    "3days": "date_posted:3days",
    week: "date_posted:week",
    month: "date_posted:month",
};

async function fetchSerpApiPages(
    jobTitle: string,
    location: string,
    countryCode: string,
    apiKey: string,
    datePosted?: string
) {
    const allJobs = [];
    let nextPageToken: string | undefined;

    // Direct user report (2026-08-28): a broad "software developer"/Canada
    // search returned only ~30 results — traced to this loop being capped
    // at 3 pages, and Google Jobs returns exactly 10 results/page. Raised
    // to 10 (researched via agy): Google Jobs itself has a hard ceiling
    // around 100-200 total results per query regardless of page count (it's
    // a consumer aggregator, not a comprehensive job database — real
    // portals like LinkedIn/Indeed get their volume from their own indexed
    // DB + direct ATS feeds, a fundamentally different architecture than
    // this app's), so 10 pages (100 results) is close to that real ceiling
    // without paying for pages beyond it. Real cost: up to 10 SerpApi
    // credits per broad search instead of 3 — narrower searches still break
    // out of this loop early via the `if (!nextPageToken) break` below.
    for (let page = 0; page < 10; page++) {
        const params = new URLSearchParams({
            engine: "google_jobs",
            q: jobTitle,
            location,
            gl: countryCode,
            hl: "en",
            api_key: apiKey,
        });
        if (datePosted && DATE_POSTED_CHIPS[datePosted]) {
            params.set("chips", DATE_POSTED_CHIPS[datePosted]);
        }
        if (nextPageToken) params.set("next_page_token", nextPageToken);

        const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
        const data = await response.json();

        if (data.error) {
            // A real bug found live testing lib/reresolveApplyLink.ts against
            // a narrow, specific-title query (few total matching results):
            // Google/SerpApi can return a `data.error` on PAGE 2+ meaning
            // simply "no more results to paginate" (e.g. the same
            // "hasn't returned any results" text isNoResultsError already
            // treats as a legitimate empty search on page 1) — not a real
            // failure. Throwing unconditionally here discarded the
            // perfectly good page-1 results already collected in `allJobs`
            // for the WHOLE multi-page fetch. Only the first page's error
            // (or a quota-exhaustion error on any page, which must still
            // propagate so the caller can fail over to the next key) is a
            // genuine failure; a later page erroring just means pagination
            // is done.
            const err = new Error(`${data.error}${!response.ok ? ` (HTTP ${response.status})` : ""}`);
            if (page === 0 || isQuotaExhaustedError(err)) throw err;
            break;
        }

        const jobs = data.jobs_results || [];
        if (jobs.length === 0) break;

        allJobs.push(
            ...jobs.map((job: SerpApiJobResult) => ({
                id: job.job_id,
                title: job.title,
                company: job.company_name,
                location: job.location,
                description: job.description,
                url: job.share_link,
                applyUrl: pickApplyUrl(job.apply_options, job.company_name),
                rawApplyOptions: job.apply_options,
                salary: job.detected_extensions?.salary,
                type: job.detected_extensions?.schedule_type,
                postedAt: job.detected_extensions?.posted_at,
                source: "SerpApi",
                logoUrl: job.thumbnail
            }))
        );

        // Google Jobs via SerpApi paginates with a next_page_token, not
        // a `start` offset — a `start` offset returns the same page.
        nextPageToken = data.serpapi_pagination?.next_page_token;
        if (!nextPageToken) break;
    }

    return allJobs;
}

async function searchWithSerpApiKey(
    jobTitle: string,
    location: string,
    countryCode: string,
    apiKey: string,
    datePosted?: string
) {
    const normalizedLocation = normalizeLocationForSerpApi(location);
    let allJobs;
    let resolvedLocation = normalizedLocation;
    try {
        allJobs = await fetchSerpApiPages(jobTitle, normalizedLocation, countryCode, apiKey, datePosted);
    } catch (err) {
        // A quota-exhausted key will fail the location-resolution retry
        // too (it's the same dead key) — let it propagate immediately so
        // the caller can fail over to a different key instead of wasting
        // a second doomed call.
        if (isQuotaExhaustedError(err)) throw err;

        // Informal/regional names ("Greater Toronto Area") have no
        // direct canonical entry — resolve one via the Locations API
        // and retry once before giving up.
        const resolved = await resolveCanonicalLocation(location, apiKey);
        if (!resolved || resolved === normalizedLocation) {
            // A genuine zero-match query is a real search outcome, not a
            // failure — return an empty set so the UI renders its normal
            // empty state instead of an error banner.
            if (isNoResultsError(err)) return [];
            throw new Error(`Job search failed for location "${location}": ${(err as Error).message}`);
        }
        resolvedLocation = resolved;
        try {
            allJobs = await fetchSerpApiPages(jobTitle, resolved, countryCode, apiKey, datePosted);
        } catch (retryErr) {
            if (isNoResultsError(retryErr)) return [];
            throw retryErr;
        }
    }

    // Google Jobs broadens its geographic radius the deeper you
    // paginate — keep a job only if its location matches the (possibly
    // resolved) searched city, is unbound ("Anywhere"), or is
    // explicitly titled remote.
    return filterByCity(allJobs, resolvedLocation);
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

// Ordered chain of SerpApi accounts to try — SERPAPI_KEY is the primary,
// SERPAPI_KEY_FALLBACK/SERPAPI_KEY_FALLBACK_2 are separate accounts kept
// specifically so a monthly-quota exhaustion on one doesn't take job
// search down (Phase 11). Only a quota-exhausted error advances to the
// next key — any other failure (bad location, network) surfaces
// immediately rather than silently burning every account's quota on the
// same doomed request.
function getSerpApiKeyChain(): string[] {
    return [process.env.SERPAPI_KEY, process.env.SERPAPI_KEY_FALLBACK, process.env.SERPAPI_KEY_FALLBACK_2].filter(
        (key): key is string => Boolean(key)
    );
}

const serpApiProvider: JobScraperProvider = {
    async search(jobTitle, location, countryCode, datePosted) {
        const keys = getSerpApiKeyChain();
        if (keys.length === 0) throw new Error("Missing SERPAPI_KEY");

        for (let i = 0; i < keys.length; i++) {
            try {
                return await searchWithSerpApiKey(jobTitle, location, countryCode, keys[i], datePosted);
            } catch (err) {
                const isLastKey = i === keys.length - 1;
                if (isLastKey || !isQuotaExhaustedError(err)) throw err;
                console.warn(`SerpApi key ${i + 1}/${keys.length} exhausted — retrying with the next account.`);
            }
        }

        // Unreachable (the loop above always returns or throws), but keeps
        // TypeScript's control-flow analysis happy about a return on every path.
        throw new Error("All configured SerpApi keys were exhausted.");
    }
};

// TheirStack Job Search API — https://theirstack.com, real structured job
// data across 100+ countries (not scraped Google Jobs results). Used ONLY
// as an overflow fallback: SerpApi's own 3-key chain (getSerpApiKeyChain
// above) is the primary path and already absorbs normal monthly-quota
// exhaustion on any single account; TheirStack only gets called — and only
// then spends real credits (1 per job returned) — when EVERY configured
// SerpApi key is exhausted at once. Direct user decision (2026-08-28):
// Serper.dev was considered too but dropped entirely — confirmed via its
// own docs it has no "jobs" search type at all (search/news/places/images/
// videos/shopping/scholar/patents only), so it can't serve this role.
type TheirStackJobResult = {
    id: number | string;
    job_title?: string;
    company?: string;
    description?: string;
    url?: string;
    source_url?: string;
    final_url?: string;
    date_posted?: string;
    location?: string;
    short_location?: string;
    cities?: string[];
    remote?: boolean;
    employment_statuses?: string[];
    salary_string?: string;
    company_object?: { logo?: string };
};

// TheirStack's date filter is "days old, inclusive of today" (posted_at_max_age_days:
// 0 = today only, 1 = today+yesterday) — same underlying concept as SerpApi's
// DATE_POSTED_CHIPS above, just a different shape, so reuse that mapping
// rather than inventing a second one.
const THEIRSTACK_MAX_AGE_DAYS: Record<string, number> = {
    today: 0,
    "3days": 2,
    week: 6,
    month: 29,
};

function getTheirStackApiKey(): string | null {
    return process.env.THEIRSTACK_API_KEY || null;
}

const theirstackProvider: JobScraperProvider = {
    async search(jobTitle, location, countryCode, datePosted) {
        const apiKey = getTheirStackApiKey();
        if (!apiKey) throw new Error("Missing THEIRSTACK_API_KEY");

        const maxAgeDays = (datePosted && THEIRSTACK_MAX_AGE_DAYS[datePosted]) ?? 30;

        const response = await fetch("https://api.theirstack.com/v1/jobs/search", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                job_title_or: [jobTitle],
                job_country_code_or: [countryCode.toUpperCase()],
                posted_at_max_age_days: maxAgeDays,
                limit: 25,
            }),
        });

        if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            throw new Error(`TheirStack API error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const json = await response.json();
        const jobs: TheirStackJobResult[] = Array.isArray(json) ? json : (json.data ?? []);

        // Same "keep only what actually matches the searched city, or is
        // explicitly unbound/remote" filter SerpApi's own provider applies
        // at the end of searchWithSerpApiKey — TheirStack's location fields
        // differ in shape (short_location/cities/remote vs a single
        // location string) but the filtering intent is identical.
        const searchCity = location.split(",")[0].trim().toLowerCase();
        const filtered = jobs.filter((job) => {
            if (job.remote) return true;
            const candidates = [job.short_location, job.location, ...(job.cities ?? [])]
                .filter((v): v is string => Boolean(v))
                .map((v) => v.toLowerCase());
            return candidates.some((c) => c.includes(searchCity));
        });

        return filtered.map((job) => ({
            id: String(job.id),
            title: job.job_title ?? "",
            company: job.company ?? "",
            location: job.short_location || job.location || (job.remote ? "Remote" : ""),
            description: job.description ?? "",
            url: job.source_url || job.url || job.final_url || "",
            applyUrl: job.final_url || job.url,
            salary: job.salary_string,
            type: job.employment_statuses?.[0],
            postedAt: job.date_posted,
            source: "TheirStack",
            logoUrl: job.company_object?.logo,
        }));
    },
};

// OpenWeb Ninja's JSearch API — a second, independent wrapper around the
// SAME Google for Jobs index SerpApi's own google_jobs engine scrapes (its
// own product page says so directly: "in Real-Time from Google for Jobs").
// NOT run concurrently with SerpApi on every search (that would mean
// paying its per-use PAYG cost on every healthy search for near-duplicate
// data) — only reached as a fallback tier, same as TheirStack/Apify,
// specifically so a SerpApi quota exhaustion (the real incident this
// project hit live, 2026-09-01 — all 3 SerpApi accounts hit 0/250 for the
// month) doesn't block search entirely until the monthly reset. Confirmed
// live (2026-09-01, real test calls against a real trial key): genuine
// global coverage (tested Toronto AND Berlin, correctly localized results
// in each), and a real apply-link mix comparable to SerpApi/Adzuna's own
// (several direct employer career-site links alongside trusted-aggregator
// and known-low-quality-mirror links) — handled by the SAME
// classifyApplyHost/rescue pipeline every other source already goes
// through, no special-casing needed here.
type JSearchJobResult = {
    job_id: string;
    job_title?: string;
    employer_name?: string;
    employer_logo?: string;
    employer_website?: string;
    job_description?: string;
    job_apply_link?: string;
    job_apply_is_direct?: boolean;
    job_employment_type?: string;
    job_city?: string;
    job_state?: string;
    job_country?: string;
    job_is_remote?: boolean;
    job_posted_at_datetime_utc?: string;
    job_min_salary?: number;
    job_max_salary?: number;
    job_salary_currency?: string;
};

function getOpenWebNinjaApiKey(): string | null {
    return process.env.OPENWEBNINJA_API_KEY || null;
}

// JobsPipe — real, non-redundant structured job data (Workday + Indeed +
// Glassdoor + 30 ATS sources per their own docs, NOT the same Google for
// Jobs index SerpApi/JSearch already share). Confirmed live (2026-09-02,
// real test calls against a real trial key): correct results, real
// apply-link mix (direct ATS + trusted aggregators, no low-quality mirrors
// in the sample tested), and — notably — every record already carries
// server-side freshness fields (status/closed_at/verified_at) this app
// would otherwise have to build itself. Billed per job record returned
// (trial: 1,000/month), not per request.
type JobsPipeJobResult = {
    id: string;
    job_title: string;
    company: string;
    url?: string;
    final_url?: string | null;
    source_url?: string;
    location?: string;
    short_location?: string;
    remote?: boolean;
    employment_statuses?: string[];
    salary_string?: string | null;
    date_posted?: string;
    status?: string;
};

function getJobsPipeApiKey(): string | null {
    return process.env.JOBSPIPE_API_KEY || null;
}

const jobsPipeProvider: JobScraperProvider = {
    async search(jobTitle, location, countryCode) {
        const apiKey = getJobsPipeApiKey();
        if (!apiKey) throw new Error("Missing JOBSPIPE_API_KEY");

        const response = await fetch("https://api.jobspipe.dev/v1/jobs/search", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                job_title_or: [jobTitle],
                job_country_code_or: [countryCode.toUpperCase()],
                limit: 25,
            }),
        });

        if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            throw new Error(`JobsPipe API error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const json = await response.json();
        const jobs: JobsPipeJobResult[] = json.data ?? [];

        // Only postings JobsPipe itself still marks active — same intent as
        // this project's own is_active tracking on discovered_postings, no
        // reason to surface something they've already flagged closed.
        const active = jobs.filter((job) => !job.status || job.status === "active");
        const filtered = filterByCity(
            active.map((job) => ({ ...job, location: job.short_location || job.location || "" })),
            location,
        );

        return filtered.map((job) => ({
            id: `jobspipe-${job.id}`,
            title: job.job_title ?? "",
            company: job.company ?? "",
            location: job.remote ? "Remote" : job.short_location || job.location || "",
            description: "",
            url: job.source_url || job.url || "",
            applyUrl: job.final_url || job.url || job.source_url,
            salary: job.salary_string ?? undefined,
            type: job.employment_statuses?.[0],
            postedAt: job.date_posted,
            source: "JobsPipe",
        }));
    },
};

function formatJSearchLocation(job: JSearchJobResult): string {
    if (job.job_is_remote) return "Remote";
    return [job.job_city, job.job_state].filter(Boolean).join(", ") || job.job_country || "";
}

function formatJSearchSalary(job: JSearchJobResult): string | undefined {
    if (!job.job_min_salary && !job.job_max_salary) return undefined;
    const currency = job.job_salary_currency ?? "";
    if (job.job_min_salary && job.job_max_salary) {
        return `${currency}${Math.round(job.job_min_salary)} - ${currency}${Math.round(job.job_max_salary)}`;
    }
    return `${currency}${Math.round(job.job_min_salary ?? job.job_max_salary ?? 0)}`;
}

const jsearchProvider: JobScraperProvider = {
    async search(jobTitle, location, countryCode) {
        const apiKey = getOpenWebNinjaApiKey();
        if (!apiKey) throw new Error("Missing OPENWEBNINJA_API_KEY");

        const params = new URLSearchParams({
            query: `${jobTitle} in ${location}`,
            country: countryCode.toLowerCase(),
            num_pages: "1",
        });

        const response = await fetch(`https://api.openwebninja.com/jsearch/search-v2?${params.toString()}`, {
            headers: { "x-api-key": apiKey },
        });

        if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            throw new Error(`JSearch API error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const json = await response.json();
        if (json.status !== "OK") {
            throw new Error(`JSearch API error: ${json.error?.message ?? "unknown error"}`);
        }

        const jobs: JSearchJobResult[] = json.data?.jobs ?? [];

        // Same "keep only what actually matches the searched city, or is
        // explicitly unbound/remote" filter every other provider applies.
        const searchCity = location.split(",")[0].trim().toLowerCase();
        const filtered = jobs.filter((job) => {
            if (job.job_is_remote) return true;
            const candidates = [job.job_city, job.job_state, job.job_country].filter((v): v is string => Boolean(v)).map((v) => v.toLowerCase());
            return candidates.some((c) => c.includes(searchCity));
        });

        return filtered.map((job) => ({
            id: `jsearch-${job.job_id}`,
            title: job.job_title ?? "",
            company: job.employer_name ?? "",
            location: formatJSearchLocation(job),
            description: job.job_description ?? "",
            url: job.job_apply_link ?? "",
            applyUrl: job.job_apply_link,
            salary: formatJSearchSalary(job),
            type: job.job_employment_type,
            postedAt: job.job_posted_at_datetime_utc,
            source: "JSearch",
            logoUrl: job.employer_logo,
        }));
    },
};

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

// RemoteOK's description is full rich-text HTML (Careerjet's own <b>-tagged
// snippets would have needed the same treatment), unlike SerpApi/Adzuna's
// already-plain-text descriptions. Deliberately minimal (strip tags, decode
// the handful of entities actually observed live in real responses,
// collapse whitespace) rather than a full HTML-entity table — this only
// needs to produce readable plain text for the evaluator/UI, not a
// lossless conversion.
function stripHtml(html: string): string {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
}

// RemoteOK's public JSON feed — confirmed live 2026-09-03, keyless, no
// registration (https://remoteok.com/api, real HTTP 200, real postings).
// Unlike every other provider here, this is a flat, unfiltered feed of
// RemoteOK's current ~100 most recent listings site-wide, not a per-query
// search endpoint — so relevance filtering happens client-side, the same
// title-word-overlap approach lib/atsProviders.ts's fetchIcimsJobs already
// uses for the same "server can't filter, so we must" situation. Every
// result is inherently remote by construction (that's RemoteOK's entire
// premise), so this is deliberately NOT run through filterByCity in
// fetchAndMergeFreeSources below — a candidate searching from any city can
// apply to a genuinely remote role regardless of what city they searched.
// RemoteOK's own API terms (in its own response body) ask for attribution
// back to remoteok.com — satisfied by this app's existing "source" badge
// convention (source: "RemoteOK", same pattern as "Indeed (via Apify)") and
// by applyUrl pointing at RemoteOK's own real listing page, never rewritten.
//
// Real data-quality caveat found live, not assumed clean: a sample of the
// feed showed several genuinely non-tech postings (e.g. "Kitchen
// Technician", "Janitor") carrying nonsensical tag arrays that included
// "engineer"/"dev" alongside "legal"/"medical" — RemoteOK's own auto-tagger
// evidently mis-tags some non-tech listings it also carries. Confirmed live
// this actually breaks search relevance: an "Engineer" query matched
// "Kitchen Technician" (Four Seasons) and "Joiner" (City of York Council)
// purely off their noise tags before this was caught — see
// remoteOkProvider's own filter comment for the fix (match job.position
// only, tags array not used for relevance at all).
type RemoteOkJobResult = {
    id?: string;
    company?: string;
    position?: string;
    tags?: string[];
    location?: string;
    description?: string;
    date?: string;
    salary_min?: number;
    salary_max?: number;
    apply_url?: string;
    url?: string;
};

function titleWordsMatch(searchTitle: string, haystack: string): boolean {
    const words = searchTitle
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2);
    if (words.length === 0) return true;
    const lowerHaystack = haystack.toLowerCase();
    return words.every((w) => lowerHaystack.includes(w));
}

const remoteOkProvider: JobScraperProvider = {
    async search(jobTitle) {
        const response = await fetch("https://remoteok.com/api", {
            // A generic browser UA — RemoteOK's own API has been observed
            // to reject requests with no User-Agent at all.
            headers: { "User-Agent": "Mozilla/5.0" },
        });

        if (!response.ok) {
            const bodyText = await response.text().catch(() => "");
            throw new Error(`RemoteOK API error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
        }

        const json: RemoteOkJobResult[] = await response.json();
        // The feed's own first entry is a legal/terms notice, not a job
        // (confirmed live: no `position` field) — filtered out by the
        // `.position` check below rather than assumed to always be index 0.
        //
        // Matches against job.position ONLY, deliberately excluding tags —
        // a real bug found live testing this exact change (2026-09-03): a
        // "Engineer" search matched "Kitchen Technician" (Four Seasons) and
        // "Joiner" (City of York Council), both non-tech postings whose
        // tags array nonsensically included "engineer" (see the
        // RemoteOkJobResult comment above for the wider mis-tagging
        // pattern). The job's own position title is unambiguous; the tags
        // array on this feed is not reliable enough to search against.
        return json
            .filter((job) => job.position && titleWordsMatch(jobTitle, job.position))
            .map((job) => ({
                id: `remoteok-${job.id}`,
                title: job.position ?? "",
                company: job.company ?? "",
                location: "Remote",
                description: stripHtml(job.description ?? ""),
                url: job.url ?? job.apply_url ?? "",
                applyUrl: job.apply_url ?? job.url,
                salary: job.salary_min && job.salary_max ? `$${job.salary_min} - $${job.salary_max}` : undefined,
                postedAt: job.date,
                source: "RemoteOK",
            }));
    },
};

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
                    fetchDetails: process.env.APIFY_LINKEDIN_FETCH_DETAILS !== "false",
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
async function fetchAndMergeFreeSources(
    serpApiPromise: Promise<NormalizedJob[]>,
    jobTitle: string,
    location: string,
    countryCode: string,
): Promise<NormalizedJob[]> {
    const extraSources: Array<{ name: string; promise: Promise<NormalizedJob[]> }> = [];

    if (getAdzunaCredentials()) {
        extraSources.push({
            name: "Adzuna",
            // filterByCity as a defensive second layer, not the primary
            // control — Adzuna's own `where=` param already does real
            // server-side filtering (verified live: Toronto/Vancouver/
            // Halifax return sensibly different counts), but this keeps
            // exactly one function deciding city relevance rather than
            // trusting each provider's own filtering to be equally strict.
            promise: searchAdzunaWithRetry(jobTitle, location, countryCode).then((jobs) => filterByCity(jobs, location)),
        });
    }
    extraSources.push({ name: "RemoteOK", promise: remoteOkProvider.search(jobTitle, location, countryCode) });

    // The two PAID Apify sources (2026-09-04) — see their definitions above
    // for the measurements behind choosing them. Run on every search rather
    // than as an exhaustion fallback, because their whole point is closing a
    // volume/quality gap that exists whether or not SerpApi is healthy:
    // LinkedIn was a total blind spot, and hirebase is the only source here
    // returning direct employer ATS links with real salary ranges.
    //
    // Both are gated on APIFY_API_TOKEN and on their own item caps, so a
    // deployment without the token (or with the caps set to 0) simply
    // behaves as it did before. filterByCity applies to hirebase because it
    // returns whole-country matches; LinkedIn results are already
    // location-scoped by the actor's own `location` input.
    if (getApifyToken()) {
        extraSources.push({ name: "LinkedIn", promise: apifyLinkedInProvider.search(jobTitle, location, countryCode) });
        extraSources.push({
            name: "Employer ATS",
            promise: apifyHirebaseProvider.search(jobTitle, location, countryCode).then((jobs) => filterByCity(jobs, location)),
        });
    }

    // Real bug found by running a live search (2026-09-04): this used to
    // await serpApiPromise UNGUARDED inside Promise.all, so the moment
    // SerpApi rejected — which it does on every search right now, all three
    // keys sitting at 0/250 — the whole merge rejected and every other
    // source's results were thrown away. Those sources had already been
    // started, so the work (and, for the paid ones, the spend) happened and
    // was then discarded. The caller's catch then re-ran a narrower set via
    // fetchMergedExhaustionFallback, which is why a search returned only
    // Adzuna/JobsPipe/JSearch and zero LinkedIn or Employer-ATS results.
    //
    // SerpApi is now caught like every other source. One dead provider must
    // never be able to discard the others; whether it failed is reported
    // back so the caller can still decide about its own last-resort tiers.
    let serpApiFailure: unknown = null;
    const guardedSerpApi = serpApiPromise.catch((err) => {
        serpApiFailure = err;
        return [] as NormalizedJob[];
    });

    const [primary, ...settled] = await Promise.all([
        guardedSerpApi,
        ...extraSources.map(({ name, promise }) =>
            // Merging is a best-effort improvement, never a reason to fail a
            // search that already has real results from elsewhere — Adzuna's
            // own entry above has already had its one real retry by now.
            promise.catch((err) => {
                console.error(`[jobScraper] ${name} merge failed`, err);
                return [] as NormalizedJob[];
            }),
        ),
    ]);

    const merged = dedupeJobs([primary, ...settled].flat());
    settled.forEach((jobs, i) => {
        if (jobs.length > 0) console.warn(`[jobScraper] ${extraSources[i].name} contributed ${jobs.length} result(s) alongside SerpApi's ${primary.length}.`);
    });

    // Only escalate to the paid last-resort tiers when SerpApi genuinely
    // failed AND nothing else produced anything — not merely because SerpApi
    // is out, which is now the normal state rather than an emergency.
    if (merged.length === 0 && serpApiFailure) throw serpApiFailure;
    return merged;
}

// TEMPORARY, DELIBERATE CONFIGURATION (2026-09-04, direct user request):
// every legacy provider is switched off and a live search now runs ONLY the
// two paid Apify sources. This is an isolation test — with Adzuna, SerpApi,
// JSearch, JobsPipe, RemoteOK, TheirStack and the Apify Indeed actor all out
// of the way, whatever appears on screen is attributable to LinkedIn +
// Employer-ATS alone, plus this app's own free ATS crawl (which lives in
// lib/actions/scraper.actions.ts, not here, and is unaffected).
//
// Nothing was deleted to achieve this. Every provider above is still defined,
// still tested and still wired to its own credential check, so restoring the
// previous behaviour is a matter of putting the calls back into
// fetchAndMergeFreeSources — see git history for the exact prior shape.
// SerpApi's country-code resolution is also skipped, since it needs a working
// SerpApi key and all three are currently exhausted.
export async function searchJobs(
    jobTitle: string,
    location: string,
    countryCode: string = "ca",
    provider: "serpapi" = "serpapi",
    datePosted?: string
): Promise<NormalizedJob[]> {
    void provider;
    void datePosted;

    if (!getApifyToken()) {
        throw new Error("Missing APIFY_API_TOKEN — the current search configuration requires it.");
    }

    const sources: Array<{ name: string; promise: Promise<NormalizedJob[]> }> = [
        { name: "LinkedIn", promise: apifyLinkedInProvider.search(jobTitle, location, countryCode) },
        {
            name: "Employer ATS",
            promise: apifyHirebaseProvider.search(jobTitle, location, countryCode).then((jobs) => filterByCity(jobs, location)),
        },
    ];

    const settled = await Promise.all(
        sources.map(({ name, promise }) =>
            promise.catch((err) => {
                console.error(`[jobScraper] ${name} failed`, err);
                return [] as NormalizedJob[];
            }),
        ),
    );

    settled.forEach((jobs, i) => console.warn(`[jobScraper] ${sources[i].name} contributed ${jobs.length} result(s).`));
    return dedupeJobs(settled.flat());
}