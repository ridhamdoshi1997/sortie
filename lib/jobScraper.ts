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

// SerpApi returns HTTP 200 + a `data.error` string for both "out of
// searches this month" and unrelated issues (bad location, etc) — there's
// no distinct status code to key off, so detect quota exhaustion by the
// error text itself. Only this class of failure should burn a fallback
// key; a real "no results for this query" shouldn't retry on a second key.
function isQuotaExhaustedError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return /run out of searches|out of searches|monthly limit|plan.*limit|429/i.test(message);
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

    for (let page = 0; page < 3; page++) {
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
    const searchCity = resolvedLocation.split(",")[0].trim().toLowerCase();
    return allJobs.filter((job) => {
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

export async function searchJobs(
    jobTitle: string,
    location: string,
    countryCode: string = "ca",
    provider: "serpapi" = "serpapi",
    datePosted?: string
): Promise<NormalizedJob[]> {

    if (provider === "serpapi") {
        return serpApiProvider.search(jobTitle, location, countryCode, datePosted);
    }

    throw new Error("Invalid scraper provider selected.");
}