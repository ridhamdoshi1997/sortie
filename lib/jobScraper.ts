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
};

export type NormalizedJob = {
    id: string;
    title: string;
    company: string;
    location: string;
    description: string;
    url: string;
    applyUrl?: string;
    salary?: string;
    type?: string;
    postedAt?: string;
    source: string;
};

// Google Jobs listings via SerpApi carry a `share_link` (a google.com/search
// deep link back into the Google Jobs UI, not a real application page) plus
// an `apply_options` array of real destinations — the employer's own ATS
// posting when one exists, plus third-party boards (LinkedIn, Indeed, etc).
// Prefer the employer's own portal over a generic aggregator when both are
// present, since that's what "apply link" actually means to a candidate.
const AGGREGATOR_HOSTS = ["linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "google.com"];

function pickApplyUrl(applyOptions: Array<{ link?: string }> | undefined): string | undefined {
    if (!applyOptions || applyOptions.length === 0) return undefined;

    const isAggregator = (link: string) => {
        try {
            const host = new URL(link).hostname.replace(/^www\./, "");
            return AGGREGATOR_HOSTS.some((aggregator) => host.endsWith(aggregator));
        } catch {
            return false;
        }
    };

    const direct = applyOptions.find((option) => option.link && !isAggregator(option.link));
    return direct?.link ?? applyOptions[0]?.link;
}

export interface JobScraperProvider {
    search(jobTitle: string, location: string, countryCode: string): Promise<NormalizedJob[]>;
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

async function fetchSerpApiPages(
    jobTitle: string,
    location: string,
    countryCode: string,
    apiKey: string
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
        if (nextPageToken) params.set("next_page_token", nextPageToken);

        const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error as string);
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
                applyUrl: pickApplyUrl(job.apply_options),
                salary: job.detected_extensions?.salary,
                type: job.detected_extensions?.schedule_type,
                postedAt: job.detected_extensions?.posted_at,
                source: "SerpApi"
            }))
        );

        // Google Jobs via SerpApi paginates with a next_page_token, not
        // a `start` offset — a `start` offset returns the same page.
        nextPageToken = data.serpapi_pagination?.next_page_token;
        if (!nextPageToken) break;
    }

    return allJobs;
}

const serpApiProvider: JobScraperProvider = {
    async search(jobTitle, location, countryCode) {
        const apiKey = process.env.SERPAPI_KEY;
        if (!apiKey) throw new Error("Missing SERPAPI_KEY");

        const normalizedLocation = normalizeLocationForSerpApi(location);
        let allJobs;
        let resolvedLocation = normalizedLocation;
        try {
            allJobs = await fetchSerpApiPages(jobTitle, normalizedLocation, countryCode, apiKey);
        } catch (err) {
            // Informal/regional names ("Greater Toronto Area") have no
            // direct canonical entry — resolve one via the Locations API
            // and retry once before giving up.
            const resolved = await resolveCanonicalLocation(location, apiKey);
            if (!resolved || resolved === normalizedLocation) {
                throw new Error(`Job search failed for location "${location}": ${(err as Error).message}`);
            }
            resolvedLocation = resolved;
            allJobs = await fetchSerpApiPages(jobTitle, resolved, countryCode, apiKey);
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
};
const serperProvider: JobScraperProvider = {
    async search() {
        throw new Error("Serper integration is planned but not yet implemented.");
    }
};

export async function searchJobs(
    jobTitle: string,
    location: string,
    countryCode: string = "ca",
    provider: "serpapi" | "serper" = "serpapi"
): Promise<NormalizedJob[]> {

    if (provider === "serpapi") {
        return serpApiProvider.search(jobTitle, location, countryCode);
    }

    if (provider === "serper") {
        return serperProvider.search(jobTitle, location, countryCode);
    }

    throw new Error("Invalid scraper provider selected.");
}