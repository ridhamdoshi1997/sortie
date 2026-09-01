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

// 3 pages x 50 = up to 150, roughly matching SerpApi's own ~100-result
// practical ceiling so a search that falls back to (or is supplemented
// by) Adzuna isn't artificially thinner than one that didn't. Was a
// single 25-result page, which capped a real reported case at 23 total
// results even though Adzuna's own response reported 4,454 matches
// available for that query. Adzuna's credentials here are free-tier, so
// the extra pages cost nothing; the loop still exits early the moment a
// page comes back short, so narrow queries don't pay for empty pages.
const ADZUNA_PAGES = 3;
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

        const jobs: AdzunaJobResult[] = [];
        for (let page = 1; page <= ADZUNA_PAGES; page++) {
            const url = `https://api.adzuna.com/v1/api/jobs/${countryCode.toLowerCase()}/search/${page}?app_id=${creds.appId}&app_key=${creds.appKey}&what=${encodeURIComponent(jobTitle)}&where=${encodeURIComponent(location)}&results_per_page=${ADZUNA_PER_PAGE}&content-type=application/json`;

            const response = await fetch(url);
            if (!response.ok) {
                // A later page failing shouldn't discard pages already
                // fetched — only a failure on the very first page is a
                // real, reportable provider error.
                if (page === 1) {
                    const bodyText = await response.text().catch(() => "");
                    throw new Error(`Adzuna API error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
                }
                break;
            }

            const json = await response.json();
            const pageJobs: AdzunaJobResult[] = json.results ?? [];
            jobs.push(...pageJobs);
            if (pageJobs.length < ADZUNA_PER_PAGE) break;
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
async function fetchAndMergeAdzuna(
    serpApiPromise: Promise<NormalizedJob[]>,
    jobTitle: string,
    location: string,
    countryCode: string,
): Promise<NormalizedJob[]> {
    if (!getAdzunaCredentials()) return serpApiPromise;

    const [primary, adzunaResult] = await Promise.all([
        serpApiPromise,
        // filterByCity as a defensive second layer, not the primary
        // control — Adzuna's own `where=` param already does real
        // server-side filtering (verified live: Toronto/Vancouver/Halifax
        // return sensibly different counts), but this keeps exactly one
        // function deciding city relevance rather than trusting each
        // provider's own filtering to be equally strict.
        adzunaProvider
            .search(jobTitle, location, countryCode)
            .then((jobs) => filterByCity(jobs, location))
            // Merging is a best-effort improvement, never a reason to fail
            // a search that already has real SerpApi results.
            .catch((err) => {
                console.error("[jobScraper] Adzuna merge failed", err);
                return [] as NormalizedJob[];
            }),
    ]);

    if (adzunaResult.length === 0) return primary;
    const merged = dedupeJobs([...primary, ...adzunaResult]);
    console.warn(
        `SerpApi returned ${primary.length} result(s) for "${jobTitle}" — merged with Adzuna's ${adzunaResult.length} to ${merged.length}.`
    );
    return merged;
}

export async function searchJobs(
    jobTitle: string,
    location: string,
    countryCode: string = "ca",
    provider: "serpapi" = "serpapi",
    datePosted?: string
): Promise<NormalizedJob[]> {

    if (provider === "serpapi") {
        // Real country code for THIS search's actual target location,
        // resolved via the free Locations API lookup above — overrides the
        // caller-supplied `countryCode` (every current call site just
        // hardcodes "ca", see resolveCountryCodeForLocation's own comment
        // for the full story) whenever resolution succeeds. Falls back to
        // the caller's value only when resolution genuinely can't happen
        // (no SerpApi key configured at all, or an unrecognized location
        // string) — never a hard failure, since a wrong-but-present
        // default still lets the search proceed instead of blocking it.
        const availableKeys = getSerpApiKeyChain();
        const resolvedCountryCode =
            availableKeys.length > 0 ? await resolveCountryCodeForLocation(location, availableKeys[0]) : null;
        const effectiveCountryCode = resolvedCountryCode ?? countryCode;
        // Chain: SerpApi -> TheirStack -> JSearch -> Apify, each only
        // reached if every prior tier is genuinely exhausted (quota), never
        // on a real per-request error (bad location, malformed query,
        // network blip). Arbeitnow was researched and its code written, but
        // deliberately NOT wired in here — see the comment above
        // apifyProvider's definition for why (a real, persistent TLS cert
        // mismatch on arbeitnow.com found during live verification).
        //
        // JSearch (2026-09-01, direct user request) sits between TheirStack
        // and Apify — see jsearchProvider's own comment for why it's a
        // fallback tier, not a concurrent source like Adzuna: it draws from
        // the same Google for Jobs index SerpApi already queries, so
        // running it on every healthy search would just pay its PAYG cost
        // for near-duplicate data. It earns its place here specifically for
        // the exact incident this project hit live the same day — every
        // SerpApi account exhausted for the whole month with no overage
        // option — where a second, independent quota against the same data
        // pool is exactly what's needed.
        //
        // Adzuna is deliberately NOT one of these sequential "first success
        // wins" tiers (real bug found live, 2026-09-01, direct user
        // question after a search returned only 3 results): it used to sit
        // in this same array, meaning once SerpApi was exhausted and
        // TheirStack returned even a FEW real results (any non-empty,
        // non-error response counts as "success" here), the loop returned
        // immediately and Adzuna — normally a genuinely additive, ~free
        // source running concurrently with SerpApi on every healthy search
        // via fetchAndMergeAdzuna below — was never queried at all. Adzuna
        // now always runs and merges into whichever fallback tier (or none)
        // succeeds, the same additive relationship it already has with a
        // healthy SerpApi, instead of competing with TheirStack/Apify for
        // a single "winner" slot.
        const tiers: Array<{ name: string; hasCreds: () => boolean; run: () => Promise<NormalizedJob[]> }> = [
            { name: "TheirStack", hasCreds: () => Boolean(getTheirStackApiKey()), run: () => theirstackProvider.search(jobTitle, location, effectiveCountryCode, datePosted) },
            { name: "JSearch", hasCreds: () => Boolean(getOpenWebNinjaApiKey()), run: () => jsearchProvider.search(jobTitle, location, effectiveCountryCode, datePosted) },
            { name: "Apify", hasCreds: () => Boolean(getApifyToken()), run: () => apifyProvider.search(jobTitle, location, effectiveCountryCode, datePosted) },
        ];

        try {
            const serpApiPromise = serpApiProvider.search(jobTitle, location, effectiveCountryCode, datePosted);
            return await fetchAndMergeAdzuna(serpApiPromise, jobTitle, location, effectiveCountryCode);
        } catch (err) {
            if (!isQuotaExhaustedError(err)) throw err;

            let lastErr: unknown = err;
            for (const tier of tiers) {
                if (!tier.hasCreds()) continue;
                try {
                    console.warn(`SerpApi exhausted — falling back to ${tier.name}.`);
                    return await fetchAndMergeAdzuna(tier.run(), jobTitle, location, effectiveCountryCode);
                } catch (tierErr) {
                    if (!isQuotaExhaustedError(tierErr)) throw tierErr;
                    lastErr = tierErr;
                    console.warn(`${tier.name} also exhausted — trying next fallback.`);
                }
            }

            // Every quota-based fallback (TheirStack, Apify) is exhausted
            // or unconfigured — Adzuna alone (free, not quota-limited the
            // same way) is still worth trying rather than failing the
            // whole search outright.
            if (getAdzunaCredentials()) {
                console.warn("Every fallback exhausted — trying Adzuna alone.");
                return await adzunaProvider.search(jobTitle, location, effectiveCountryCode, datePosted);
            }
            throw lastErr;
        }
    }

    throw new Error("Invalid scraper provider selected.");
}