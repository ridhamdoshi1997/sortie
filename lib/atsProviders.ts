import type { NormalizedJob } from "@/lib/jobScraper";

// Direct Applicant Tracking System adapters (build-plan.md's Phase 8 —
// Portal Scanner, "24 ATS Provider Adapters"). Each hits the platform's own
// public, unauthenticated job-board API — the apply URL in the response IS
// the employer's real posting, not a candidate to run through
// lib/applyLinkTrust.ts's classifier. All three endpoints verified live
// against real company boards before this file was written (stripe/
// greenhouse, Lever's own demo board, ramp/ashby) — see this session's
// transcript / the approved plan for the raw responses.

export type AtsPlatform =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workable"
  | "bamboohr"
  | "dayforce"
  | "breezy"
  | "recruitee"
  | "teamtailor"
  | "join"
  | "personio"
  | "rippling"
  | "pinpoint";

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  updated_at?: string;
};

export async function fetchGreenhouseJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`);
    if (!res.ok) {
      console.warn(`[atsProviders] Greenhouse board "${slug}" returned ${res.status}`);
      return [];
    }
    const data: { jobs?: GreenhouseJob[] } = await res.json();
    return (data.jobs ?? []).map((job) => ({
      id: `greenhouse-${job.id}`,
      title: job.title,
      company: companyName,
      location: job.location?.name ?? "",
      description: "",
      url: job.absolute_url,
      applyUrl: job.absolute_url,
      postedAt: job.updated_at,
      source: "greenhouse",
    }));
  } catch (error) {
    console.warn(`[atsProviders] Greenhouse fetch failed for "${slug}"`, error);
    return [];
  }
}

type LeverJob = {
  id: string;
  text: string;
  hostedUrl: string;
  applyUrl: string;
  categories?: { location?: string };
  createdAt?: number;
};

export async function fetchLeverJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    if (!res.ok) {
      console.warn(`[atsProviders] Lever board "${slug}" returned ${res.status}`);
      return [];
    }
    const data: LeverJob[] | { ok: false } = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((job) => ({
      id: `lever-${job.id}`,
      title: job.text,
      company: companyName,
      location: job.categories?.location ?? "",
      description: "",
      url: job.hostedUrl,
      applyUrl: job.applyUrl ?? job.hostedUrl,
      postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : undefined,
      source: "lever",
    }));
  } catch (error) {
    console.warn(`[atsProviders] Lever fetch failed for "${slug}"`, error);
    return [];
  }
}

type AshbyJob = {
  id: string;
  title: string;
  jobUrl: string;
  applyUrl: string;
  location?: string;
  publishedAt?: string;
};

export async function fetchAshbyJobs(orgName: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(orgName);
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    if (!res.ok) {
      console.warn(`[atsProviders] Ashby board "${slug}" returned ${res.status}`);
      return [];
    }
    const data: { jobs?: AshbyJob[] } = await res.json();
    return (data.jobs ?? []).map((job) => ({
      id: `ashby-${job.id}`,
      title: job.title,
      company: companyName,
      location: job.location ?? "",
      description: "",
      url: job.jobUrl,
      applyUrl: job.applyUrl ?? job.jobUrl,
      postedAt: job.publishedAt,
      source: "ashby",
    }));
  } catch (error) {
    console.warn(`[atsProviders] Ashby fetch failed for "${slug}"`, error);
    return [];
  }
}

// Real, public, unauthenticated postings API — confirmed live 2026-08-30
// (research via `agy`, then verified directly): the company identifier
// isn't derivable from blind slug-guessing alone any more reliably than
// Greenhouse/Lever/Ashby's (confirmed: guessCompanySlugs' own bare/stripped
// forms happen to BE the real identifier for real customers checked live,
// e.g. "smartrecruiters" itself) — reuses the same guess list as the other
// three rather than inventing a separate one.
type SmartRecruitersJob = {
  id: string;
  name: string;
  refNumber?: string;
  releasedDate?: string;
  location?: { city?: string; region?: string; country?: string; remote?: boolean };
};

// Paginated (2026-09-04). This used to request a single `limit=50` page,
// and a live test of 10 real registry slugs had THREE return exactly 50 --
// i.e. silently truncated boards, with the remainder never entering the
// crawl cache at all. SmartRecruiters caps `limit` at 100, so this walks
// offsets until a short page arrives.
//
// MAX_PAGES bounds the walk: a handful of enterprise boards run to
// thousands of postings, and one company must not be able to monopolise a
// crawl batch. 5 pages = 500 postings, comfortably above every board seen
// in testing while keeping the worst case predictable.
const SMARTRECRUITERS_PAGE_SIZE = 100;
const SMARTRECRUITERS_MAX_PAGES = 5;

export async function fetchSmartRecruitersJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const collected: SmartRecruitersJob[] = [];
    for (let page = 0; page < SMARTRECRUITERS_MAX_PAGES; page++) {
      const offset = page * SMARTRECRUITERS_PAGE_SIZE;
      const res = await fetch(
        `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=${SMARTRECRUITERS_PAGE_SIZE}&offset=${offset}`,
      );
      if (!res.ok) {
        // A later page failing is not a reason to discard the pages that
        // already succeeded — returning them is strictly better than zero.
        if (page === 0) {
          console.warn(`[atsProviders] SmartRecruiters company "${slug}" returned ${res.status}`);
          return [];
        }
        break;
      }
      const body: { content?: SmartRecruitersJob[] } = await res.json();
      const batch = body.content ?? [];
      collected.push(...batch);
      // A short page is the last page.
      if (batch.length < SMARTRECRUITERS_PAGE_SIZE) break;
    }
    const data: { content?: SmartRecruitersJob[] } = { content: collected };
    return (data.content ?? []).map((job) => {
      const applyUrl = `https://jobs.smartrecruiters.com/${slug}/${job.id}`;
      const loc = job.location;
      return {
        id: `smartrecruiters-${job.id}`,
        title: job.name,
        company: companyName,
        location: [loc?.city, loc?.region, loc?.country].filter(Boolean).join(", "),
        description: "",
        url: applyUrl,
        applyUrl,
        postedAt: job.releasedDate,
        source: "smartrecruiters",
      };
    });
  } catch (error) {
    console.warn(`[atsProviders] SmartRecruiters fetch failed for "${slug}"`, error);
    return [];
  }
}

// Workable's public account widget API — confirmed live 2026-09-03 against
// real accounts from the same CC-BY-4.0 dataset the Workday/iCIMS seeds came
// from (1000heads returned 22 real postings). Note the endpoint choice is
// load-bearing and was NOT assumed from docs: the newer-looking
// /api/v3/accounts/{slug}/jobs path 404s on every account tested, while
// /api/v1/widget/accounts/{slug}?details=true returns 200 with real data.
//
// Materially better payload than the other slug platforms: this one returns
// a full `description` inline, so Workable jobs arrive with real body text
// rather than the empty description Greenhouse's ?content=false list mode
// gives (the very gap that made lib/jobPreFilter.ts hide every direct-ATS
// job until 2026-09-03). Also carries employment_type, published_on and
// structured city/state/country.
type WorkableJob = {
  title: string;
  shortcode: string;
  employment_type?: string;
  url?: string;
  shortlink?: string;
  application_url?: string;
  published_on?: string;
  city?: string;
  state?: string;
  country?: string;
  description?: string;
};

export async function fetchWorkableJobs(accountSlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(accountSlug);
  try {
    const res = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) {
      console.warn(`[atsProviders] Workable account "${slug}" returned ${res.status}`);
      return [];
    }
    const data: { jobs?: WorkableJob[] } = await res.json();
    return (data.jobs ?? []).map((job) => {
      const applyUrl = job.shortlink ?? job.url ?? `https://apply.workable.com/j/${job.shortcode}`;
      return {
        id: `workable-${job.shortcode}`,
        title: job.title,
        company: companyName,
        location: [job.city, job.state, job.country].filter(Boolean).join(", "),
        // Strip Workable's HTML body to plain text, same treatment
        // lib/jobScraper.ts's stripHtml gives RemoteOK's rich-text bodies.
        description: (job.description ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(),
        url: applyUrl,
        applyUrl,
        type: job.employment_type,
        postedAt: job.published_on,
        source: "workable",
      };
    });
  } catch (error) {
    console.warn(`[atsProviders] Workable fetch failed for "${slug}"`, error);
    return [];
  }
}

// BambooHR's public careers list — confirmed live 2026-09-03 against real
// subdomains from the CC-BY-4.0 dataset (17capital returned 2 real postings;
// its per-job apply URL, /careers/{id}, was separately confirmed to resolve
// HTTP 200, so the link this produces is a real page and not a constructed
// guess). Subdomain-per-employer, which behaves as a slug for our purposes,
// so it joins the slug-based family rather than needing a tenant-shaped
// crawler like Workday/iCIMS.
//
// List mode carries no description and no posted date — same shape as
// Greenhouse, and the reason lib/jobPreFilter.ts's direct-ATS exemption
// (2026-09-03) has to exist: without it every BambooHR job would be hidden
// on arrival for having a short description and no salary.
type BambooHrJob = {
  id: string | number;
  jobOpeningName: string;
  departmentLabel?: string;
  employmentStatusLabel?: string;
  isRemote?: boolean | null;
  location?: { city?: string | null; state?: string | null };
};

export async function fetchBambooHrJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const res = await fetch(`https://${slug}.bamboohr.com/careers/list`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) {
      console.warn(`[atsProviders] BambooHR board "${slug}" returned ${res.status}`);
      return [];
    }
    const data: { result?: BambooHrJob[] } = await res.json();
    return (data.result ?? []).map((job) => {
      const applyUrl = `https://${slug}.bamboohr.com/careers/${job.id}`;
      const location = job.isRemote ? "Remote" : [job.location?.city, job.location?.state].filter(Boolean).join(", ");
      return {
        id: `bamboohr-${slug}-${job.id}`,
        title: job.jobOpeningName,
        company: companyName,
        location,
        description: "",
        url: applyUrl,
        applyUrl,
        type: job.employmentStatusLabel,
        postedAt: undefined,
        source: "bamboohr",
      };
    });
  } catch (error) {
    console.warn(`[atsProviders] BambooHR fetch failed for "${slug}"`, error);
    return [];
  }
}

// Dayforce (Ceridian) — the hardest of these to reach, and worth recording
// how it was actually solved, because guessing got nowhere. An initial pass
// (2026-09-03) probed every plausible REST shape and got 404/403 on all of
// them, and the served HTML is a Next.js SPA carrying no job data, so this
// was briefly written off as unreachable. It isn't: driving a real client
// portal in a browser and reading its own network calls revealed the API,
// and then patching XMLHttpRequest to capture the app's own request body
// gave the exact payload. Three things had to be right at once, none of
// which are guessable:
//   1. It's a POST to /api/geo/{clientNamespace}/jobposting/search — the
//      earlier probes failed partly because they were GETs.
//   2. It needs a session: load the portal page for cookies, then hit
//      /api/auth/csrf and send the token as `x-csrf-token`. Without it the
//      response is 403; with it, 400 (i.e. auth accepted, body wrong) —
//      that transition is what proved the approach was viable.
//   3. The body is camelCase and wants `jobBoardCode` ("CANDIDATEPORTAL",
//      the careerSiteXRefCode from the portal's own route), NOT a numeric
//      board id. Every PascalCase/JobBoardId variant is rejected.
// Confirmed live end to end: 25 real postings with full 2,100-2,700 char
// descriptions and real city/state locations.
//
// Also corrects an earlier misreading of the dataset: rows like
// `jobs.dayforcehcm.com/api/geo/nextier` were dismissed as junk, but
// `nextier` is a real clientNamespace — that path IS the API. Both the
// /api/geo/{client} and /en-US/{client}/CANDIDATEPORTAL shapes are
// harvestable for client codes.
type DayforceJobPosting = {
  jobPostingId: number;
  jobTitle: string;
  jobDescription?: string;
  postingStartTimestampUTC?: string | null;
  postingLocations?: { cityName?: string; stateCode?: string; isoCountryCode?: string }[];
};

const DAYFORCE_BASE = "https://jobs.dayforcehcm.com";
const DAYFORCE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function fetchDayforceJobs(clientNamespace: string, companyName: string, boardCode = "CANDIDATEPORTAL"): Promise<NormalizedJob[]> {
  const client = normalizeSlug(clientNamespace);
  const portalUrl = `${DAYFORCE_BASE}/en-US/${client}/${boardCode}`;
  try {
    // Establish the session the API requires (see step 2 above).
    const jar: string[] = [];
    const collect = (res: Response) => {
      for (const [key, value] of res.headers) {
        if (key.toLowerCase() === "set-cookie") jar.push(value.split(";")[0]);
      }
    };

    const portal = await fetch(portalUrl, { headers: { "User-Agent": DAYFORCE_UA } });
    if (!portal.ok) {
      console.warn(`[atsProviders] Dayforce portal "${client}" returned ${portal.status}`);
      return [];
    }
    collect(portal);

    const csrfRes = await fetch(`${DAYFORCE_BASE}/api/auth/csrf`, {
      headers: { "User-Agent": DAYFORCE_UA, Cookie: jar.join("; ") },
    });
    collect(csrfRes);
    const { csrfToken } = (await csrfRes.json().catch(() => ({}))) as { csrfToken?: string };
    if (!csrfToken) {
      console.warn(`[atsProviders] Dayforce csrf token unavailable for "${client}"`);
      return [];
    }

    const res = await fetch(`${DAYFORCE_BASE}/api/geo/${client}/jobposting/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": DAYFORCE_UA,
        Origin: DAYFORCE_BASE,
        Referer: portalUrl,
        Cookie: jar.join("; "),
        "x-csrf-token": csrfToken,
      },
      // Exactly the payload the portal's own client sends — camelCase,
      // jobBoardCode not JobBoardId. Empty searchText is list mode.
      body: JSON.stringify({
        clientNamespace: client,
        jobBoardCode: boardCode,
        cultureCode: "en-US",
        searchText: "",
        distanceUnit: 0,
        paginationStart: 0,
      }),
    });

    if (!res.ok) {
      console.warn(`[atsProviders] Dayforce search for "${client}" returned ${res.status}`);
      return [];
    }

    // Guarded rather than a bare .json(): a minority of tenants answer 200
    // with an HTML error/consent page instead of JSON, which would otherwise
    // throw a noisy parse error per company on every crawl pass.
    const data: { jobPostings?: DayforceJobPosting[] } = await res.json().catch(() => ({}));
    return (data.jobPostings ?? []).map((job) => {
      const applyUrl = `${DAYFORCE_BASE}/en-US/${client}/${boardCode}/jobs/${job.jobPostingId}`;
      const loc = job.postingLocations?.[0];
      return {
        id: `dayforce-${client}-${job.jobPostingId}`,
        title: job.jobTitle,
        company: companyName,
        location: [loc?.cityName, loc?.stateCode, loc?.isoCountryCode].filter(Boolean).join(", "),
        description: (job.jobDescription ?? "")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim(),
        url: applyUrl,
        applyUrl,
        postedAt: job.postingStartTimestampUTC ?? undefined,
        source: "dayforce",
      };
    });
  } catch (error) {
    console.warn(`[atsProviders] Dayforce fetch failed for "${client}"`, error);
    return [];
  }
}


// SAP SuccessFactors — added 2026-09-04. It is the single largest ATS this
// codebase did not cover: 325,820 jobs in the free jobhive index, and the
// platform behind employers our own registry kept failing to resolve
// (Scotiabank most visibly, whose advisor roles a live search was missing
// entirely).
//
// No JSON API exists — probed three plausible endpoints live and all returned
// HTML. But its search page is plain server-rendered markup with one
// `<tr class="data-row">` per posting and clean column cells (colTitle /
// colDate / colLocation), so it parses reliably without a browser. Same
// DOM-scraping tier fetchIcimsJobs already occupies.
//
// Tenants are custom domains (jobs.scotiabank.com), not a shared host, so the
// registry stores the full origin rather than a slug. Location and keyword
// both filter server-side, which keeps responses small and relevant.
type SuccessFactorsRow = { href: string; title: string; date: string; location: string };

const SF_ROW_SPLIT = /<tr class="data-row">/i;
const SF_TITLE = /<a href="(\/job\/[^"]+)" class="jobTitle-link">([^<]+)<\/a>/i;
const SF_CELL = /<td[^>]*class="col(Date|Location)[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;

function parseSuccessFactorsRow(card: string): SuccessFactorsRow | null {
  const title = card.match(SF_TITLE);
  if (!title) return null;
  const cells: Record<string, string> = {};
  for (const [, name, raw] of card.matchAll(SF_CELL)) {
    cells[name.toLowerCase()] = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return { href: title[1], title: title[2].trim(), date: cells.date ?? "", location: cells.location ?? "" };
}

export async function fetchSuccessFactorsJobs(origin: string, companyName: string, searchTitle: string): Promise<NormalizedJob[]> {
  // Accepts either a bare host or a full origin, since registry rows arrive
  // from several sources.
  const base = origin.startsWith("http") ? origin.replace(/\/$/, "") : `https://${origin}`;
  try {
    const url = `${base}/search/?q=${encodeURIComponent(searchTitle)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      console.warn(`[atsProviders] SuccessFactors "${base}" returned ${res.status}`);
      return [];
    }
    const html = await res.text();
    const jobs: NormalizedJob[] = [];
    for (const card of html.split(SF_ROW_SPLIT).slice(1)) {
      const row = parseSuccessFactorsRow(card);
      if (!row) continue;
      const applyUrl = `${base}${row.href}`;
      // The trailing path segment is the requisition id — a stable per-posting
      // key, unlike the title slug which repeats across branch locations.
      const id = row.href.match(/\/(\d+)\/?$/)?.[1] ?? row.href;
      jobs.push({
        id: `successfactors-${id}`,
        title: row.title,
        company: companyName,
        location: row.location,
        description: "",
        url: applyUrl,
        applyUrl,
        postedAt: row.date ? new Date(row.date).toISOString() : undefined,
        source: "successfactors",
      });
    }
    return jobs;
  } catch (error) {
    console.warn(`[atsProviders] SuccessFactors fetch failed for "${base}"`, error);
    return [];
  }
}


// ---------------------------------------------------------------------------
// Breezy / Recruitee / Teamtailor — added 2026-09-04.
//
// All three publish a public, keyless board endpoint, verified live against
// real slugs from the jobhive dataset before any of this was written:
//   breezy     https://{slug}.breezy.hr/json          200, 23 and 237 jobs
//   recruitee  https://{slug}.recruitee.com/api/offers/  200, 15 jobs
//   teamtailor https://{slug}.teamtailor.com/jobs.json   200, 5 jobs
//
// Between them the dataset holds ~4,000 companies we could not crawl at all
// before. join.com is the far bigger prize (23,547 companies) but its public
// endpoint returned 422 to the shape guessed here, so it is deliberately NOT
// added on a guess — it needs its real API researched first, the same bar
// Careerjet and Arbeitnow were held to.
//
// None of them return a usable description in list mode, which is fine: the
// crawl cache stores what the board gives and lib/jobPreFilter.ts already
// exempts direct-ATS sources from its short-description rule.
// ---------------------------------------------------------------------------

type BreezyJob = {
  id?: string;
  name?: string;
  url?: string;
  published_date?: string;
  type?: { name?: string };
  location?: { name?: string };
};

export async function fetchBreezyJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const res = await fetch(`https://${slug}.breezy.hr/json`);
    if (!res.ok) {
      console.warn(`[atsProviders] Breezy company "${slug}" returned ${res.status}`);
      return [];
    }
    const data: BreezyJob[] = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((job) => job.id && job.name)
      .map((job) => ({
        id: `breezy-${job.id}`,
        title: job.name as string,
        company: companyName,
        location: job.location?.name ?? "",
        description: "",
        url: job.url ?? `https://${slug}.breezy.hr/`,
        applyUrl: job.url ?? `https://${slug}.breezy.hr/`,
        type: job.type?.name || undefined,
        postedAt: job.published_date,
        source: "breezy",
      }));
  } catch (error) {
    console.warn(`[atsProviders] Breezy fetch failed for "${slug}"`, error);
    return [];
  }
}

type RecruiteeOffer = {
  id?: number;
  title?: string;
  location?: string;
  careers_url?: string;
  created_at?: string;
  employment_type?: string;
  salary?: { min?: string; max?: string; currency?: string; period?: string };
};

export async function fetchRecruiteeJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const res = await fetch(`https://${slug}.recruitee.com/api/offers/`);
    if (!res.ok) {
      console.warn(`[atsProviders] Recruitee company "${slug}" returned ${res.status}`);
      return [];
    }
    const data: { offers?: RecruiteeOffer[] } = await res.json();
    return (data.offers ?? [])
      .filter((offer) => offer.id && offer.title)
      .map((offer) => {
        const salary =
          offer.salary?.min && offer.salary?.max
            ? `${offer.salary.min}-${offer.salary.max} ${offer.salary.currency ?? ""} / ${offer.salary.period ?? ""}`.trim()
            : undefined;
        const applyUrl = offer.careers_url ?? `https://${slug}.recruitee.com/`;
        return {
          id: `recruitee-${offer.id}`,
          title: offer.title as string,
          company: companyName,
          location: offer.location ?? "",
          description: "",
          url: applyUrl,
          applyUrl,
          salary,
          type: offer.employment_type || undefined,
          // "2026-07-30 06:51:18 UTC" is not ISO; normalise so downstream
          // date parsing (lib/jobCanonicalization.ts's parsePostedAt) gets a
          // value it can actually read.
          postedAt: offer.created_at ? new Date(offer.created_at.replace(" UTC", "Z").replace(" ", "T")).toISOString() : undefined,
          source: "recruitee",
        };
      });
  } catch (error) {
    console.warn(`[atsProviders] Recruitee fetch failed for "${slug}"`, error);
    return [];
  }
}

// Teamtailor publishes JSON Feed (jsonfeed.org), so the jobs live under
// `items` rather than at the top level.
type TeamtailorItem = { id?: string; title?: string; url?: string; date_published?: string };

export async function fetchTeamtailorJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const res = await fetch(`https://${slug}.teamtailor.com/jobs.json`);
    if (!res.ok) {
      console.warn(`[atsProviders] Teamtailor company "${slug}" returned ${res.status}`);
      return [];
    }
    const data: { items?: TeamtailorItem[] } = await res.json();
    return (data.items ?? [])
      .filter((item) => item.id && item.title)
      .map((item) => ({
        id: `teamtailor-${item.id}`,
        title: item.title as string,
        company: companyName,
        location: "",
        description: "",
        url: item.url ?? `https://${slug}.teamtailor.com/jobs`,
        applyUrl: item.url ?? `https://${slug}.teamtailor.com/jobs`,
        postedAt: item.date_published,
        source: "teamtailor",
      }));
  } catch (error) {
    console.warn(`[atsProviders] Teamtailor fetch failed for "${slug}"`, error);
    return [];
  }
}


// join.com — added 2026-09-04, and the largest single platform in the
// jobhive dataset at 23,547 companies.
//
// It has no usable public JSON API: /api/companies/{slug}/jobs answers 401
// and the other documented-looking shapes 404. What it does have is a
// Next.js company page that ships its own state in a __NEXT_DATA__ script
// tag, jobs included. Reading a page's own embedded JSON is ordinary public
// scraping -- no key, no auth, no impersonation -- which is why this is
// acceptable where JobSpy's Indeed path (a private API key lifted from
// their iOS app) was not.
//
// The <script> carries a per-response `nonce` attribute, so it is located by
// index rather than by a fixed-attribute regex; a naive
// `<script id="__NEXT_DATA__" type="application/json">` match silently finds
// nothing here.
//
// Verified live before wiring: 01informatica and 02100 both return parsed
// jobs with title, city, country and createdAt.
type JoinJob = {
  id?: number;
  idParam?: string;
  title?: string;
  createdAt?: string;
  workplaceType?: string;
  city?: { cityName?: string; countryName?: string };
  employmentType?: { name?: string };
};

export async function fetchJoinJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const res = await fetch(`https://join.com/companies/${slug}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) {
      console.warn(`[atsProviders] join.com company "${slug}" returned ${res.status}`);
      return [];
    }
    const html = await res.text();
    const marker = html.indexOf("__NEXT_DATA__");
    if (marker < 0) return [];
    const start = html.indexOf(">", marker) + 1;
    const end = html.indexOf("</script>", start);
    if (start <= 0 || end <= start) return [];

    let items: JoinJob[] = [];
    try {
      const parsed = JSON.parse(html.slice(start, end));
      items = parsed?.props?.pageProps?.initialState?.jobs?.items ?? [];
    } catch {
      // A layout change that breaks the embedded JSON must degrade to zero
      // jobs for this company, never throw the whole crawl batch.
      console.warn(`[atsProviders] join.com "${slug}" embedded JSON did not parse`);
      return [];
    }

    return items
      .filter((job) => job.id && job.title)
      .map((job) => {
        const applyUrl = `https://join.com/companies/${slug}/${job.idParam ?? job.id}`;
        return {
          id: `join-${job.id}`,
          title: job.title as string,
          company: companyName,
          location: [job.city?.cityName, job.city?.countryName].filter(Boolean).join(", "),
          description: "",
          url: applyUrl,
          applyUrl,
          type: job.employmentType?.name || undefined,
          postedAt: job.createdAt,
          source: "join",
        };
      });
  } catch (error) {
    console.warn(`[atsProviders] join.com fetch failed for "${slug}"`, error);
    return [];
  }
}


// Personio / Rippling / Pinpoint — added 2026-09-04, all keyless and each
// verified live against a real jobhive slug before being written.
//
// A further nine platforms in that dataset were probed and REJECTED because
// their endpoints are not open: jazzhr, gem and softgarden 404, recruiterbox
// 401, eightfold 403, jobvite and darwinbox return HTML rather than JSON,
// gupy refused the connection outright. None were added on a guess.

// Personio publishes an XML feed rather than JSON. Parsed with a narrow
// regex rather than an XML library on purpose: the feed is flat, only four
// fields are wanted, and adding a parser dependency for one provider is not
// worth it. Entity-decoding matters here -- titles legitimately contain
// "&amp;" and "(m/w/d)" markers.
function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#3[49];/g, "'")
    .replace(/&amp;/g, "&");
}

function pickXmlTag(block: string, tag: string): string | undefined {
  // [^] rather than [\s\S]: this pattern is built from a TEMPLATE LITERAL,
  // which consumes the backslashes before RegExp ever sees them, so
  // "[\s\S]" silently becomes the character class [sS] -- matching only the
  // letters s and S. That returned 0 jobs from a feed holding 317 positions.
  const m = block.match(new RegExp(`<${tag}>([^]*?)</${tag}>`));
  if (!m) return undefined;
  const raw = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
  return raw ? decodeXmlEntities(raw) : undefined;
}

export async function fetchPersonioJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const res = await fetch(`https://${slug}.jobs.personio.de/xml`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      console.warn(`[atsProviders] Personio company "${slug}" returned ${res.status}`);
      return [];
    }
    const xml = await res.text();
    const jobs: NormalizedJob[] = [];
    for (const block of xml.split("<position>").slice(1)) {
      const id = pickXmlTag(block, "id");
      const title = pickXmlTag(block, "name");
      if (!id || !title) continue;
      jobs.push({
        id: `personio-${id}`,
        title,
        company: companyName,
        location: pickXmlTag(block, "office") ?? "",
        description: "",
        url: `https://${slug}.jobs.personio.de/job/${id}`,
        applyUrl: `https://${slug}.jobs.personio.de/job/${id}`,
        type: pickXmlTag(block, "employmentType"),
        postedAt: pickXmlTag(block, "createdAt"),
        source: "personio",
      });
    }
    return jobs;
  } catch (error) {
    console.warn(`[atsProviders] Personio fetch failed for "${slug}"`, error);
    return [];
  }
}

type RipplingJob = { uuid?: string; name?: string; url?: string; workLocation?: { label?: string }; department?: { label?: string } };

export async function fetchRipplingJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const res = await fetch(`https://api.rippling.com/platform/api/ats/v1/board/${slug}/jobs`);
    if (!res.ok) {
      console.warn(`[atsProviders] Rippling company "${slug}" returned ${res.status}`);
      return [];
    }
    const data: RipplingJob[] = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((job) => job.uuid && job.name)
      .map((job) => ({
        id: `rippling-${job.uuid}`,
        title: job.name as string,
        company: companyName,
        location: job.workLocation?.label ?? "",
        description: "",
        url: job.url ?? `https://ats.rippling.com/${slug}/jobs`,
        applyUrl: job.url ?? `https://ats.rippling.com/${slug}/jobs`,
        source: "rippling",
      }));
  } catch (error) {
    console.warn(`[atsProviders] Rippling fetch failed for "${slug}"`, error);
    return [];
  }
}

type PinpointPosting = {
  id?: string;
  title?: string;
  url?: string;
  location?: { name?: string };
  employment_type?: string;
  created_at?: string;
};

export async function fetchPinpointJobs(companySlug: string, companyName: string): Promise<NormalizedJob[]> {
  const slug = normalizeSlug(companySlug);
  try {
    const res = await fetch(`https://${slug}.pinpointhq.com/postings.json`);
    if (!res.ok) {
      console.warn(`[atsProviders] Pinpoint company "${slug}" returned ${res.status}`);
      return [];
    }
    const body: { data?: PinpointPosting[] } = await res.json();
    return (body.data ?? [])
      .filter((job) => job.id && job.title)
      .map((job) => ({
        id: `pinpoint-${job.id}`,
        title: job.title as string,
        company: companyName,
        location: job.location?.name ?? "",
        description: "",
        url: job.url ?? `https://${slug}.pinpointhq.com/`,
        applyUrl: job.url ?? `https://${slug}.pinpointhq.com/`,
        type: job.employment_type || undefined,
        postedAt: job.created_at,
        source: "pinpoint",
      }));
  } catch (error) {
    console.warn(`[atsProviders] Pinpoint fetch failed for "${slug}"`, error);
    return [];
  }
}

export async function fetchAtsJobs(platform: AtsPlatform, slug: string, companyName: string): Promise<NormalizedJob[]> {
  switch (platform) {
    case "greenhouse":
      return fetchGreenhouseJobs(slug, companyName);
    case "lever":
      return fetchLeverJobs(slug, companyName);
    case "ashby":
      return fetchAshbyJobs(slug, companyName);
    case "smartrecruiters":
      return fetchSmartRecruitersJobs(slug, companyName);
    case "workable":
      return fetchWorkableJobs(slug, companyName);
    case "bamboohr":
      return fetchBambooHrJobs(slug, companyName);
    case "dayforce":
      return fetchDayforceJobs(slug, companyName);
    case "breezy":
      return fetchBreezyJobs(slug, companyName);
    case "recruitee":
      return fetchRecruiteeJobs(slug, companyName);
    case "teamtailor":
      return fetchTeamtailorJobs(slug, companyName);
    case "join":
      return fetchJoinJobs(slug, companyName);
    case "personio":
      return fetchPersonioJobs(slug, companyName);
    case "rippling":
      return fetchRipplingJobs(slug, companyName);
    case "pinpoint":
      return fetchPinpointJobs(slug, companyName);
  }
}

// --- Discovery-based adapters (Workday, iCIMS) -----------------------------
//
// Unlike Greenhouse/Lever/Ashby/SmartRecruiters, Workday and iCIMS tenant
// identifiers are NOT derivable from the company name — confirmed live,
// not assumed: blind-guessed 12 combinations of Workday instance/board-name
// for a real company (RBC) and got 0 hits, while a real company's actual
// careers page (td.com → careers.td.com) reliably embeds a plain-HTML link
// to its real Workday/iCIMS tenant that a guess could never construct.
// So these adapters DISCOVER the real tenant from a real company domain
// instead of guessing a slug — the same "resolve, don't guess" principle
// lib/applyLinkTrust.ts's extractLikelyLogoDomain already established for
// logos. Real cost: 1-4 extra plain HTTP fetches per company (no browser
// rendering needed — confirmed live both platforms serve the tenant link/
// job listing in raw server HTML), only worth it because the payoff is a
// guaranteed-direct, specific posting link when it hits.

const WORKDAY_TENANT_PATTERN = /([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:([a-z]{2}-[A-Z]{2})\/)?([A-Za-z0-9_]+)/i;
const ICIMS_TENANT_PATTERN = /([a-z0-9-]+)\.icims\.com/i;

// A handful of URL conventions real companies actually use for their
// careers page — tried in order, first plain-HTTP-fetchable one that
// embeds a recognized ATS tenant link wins. Confirmed live for TD:
// `jobs.{domain}` redirects to `careers.td.com`, whose raw HTML contains
// the real Workday tenant link with zero JS execution required.
function careersUrlCandidates(domain: string): string[] {
  return [`https://jobs.${domain}`, `https://careers.${domain}`, `https://${domain}/careers`, `https://www.${domain}/careers`];
}

export type DiscoveredAts =
  | { platform: "workday"; tenant: string; wdInstance: string; locale: string; board: string }
  | { platform: "icims"; tenant: string }
  | { platform: AtsPlatform; slug: string };

// The four slug-based platforms are detected from a careers page the same
// way Workday/iCIMS already were — a company that embeds or links its
// Greenhouse/Lever/Ashby/SmartRecruiters board is telling us its real
// slug directly, which is far more reliable than guessCompanySlugs()'
// name-derived guess (that guess is why boards like "td"/"rbc" 404 —
// the company simply isn't on those platforms under that name).
const SLUG_ATS_PATTERNS: { platform: AtsPlatform; pattern: RegExp }[] = [
  { platform: "greenhouse", pattern: /(?:boards|job-boards)\.greenhouse\.io\/([a-z0-9_-]+)/i },
  { platform: "lever", pattern: /jobs\.lever\.co\/([a-z0-9_-]+)/i },
  { platform: "ashby", pattern: /jobs\.ashbyhq\.com\/([a-z0-9_%-]+)/i },
  { platform: "smartrecruiters", pattern: /jobs\.smartrecruiters\.com\/([a-z0-9_-]+)/i },
  { platform: "workable", pattern: /apply\.workable\.com\/([a-z0-9_-]+)/i },
  { platform: "bamboohr", pattern: /([a-z0-9-]+)\.bamboohr\.com/i },
  { platform: "dayforce", pattern: /jobs\.dayforcehcm\.com\/(?:en-US\/)?([a-z0-9-]+)/i },
];

async function discoverAtsFromDomain(domain: string): Promise<DiscoveredAts | null> {
  for (const url of careersUrlCandidates(domain)) {
    let html: string;
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }

    const workday = html.match(WORKDAY_TENANT_PATTERN);
    if (workday) {
      return { platform: "workday", tenant: workday[1], wdInstance: workday[2], locale: workday[3] ?? "en-US", board: workday[4] };
    }

    for (const { platform, pattern } of SLUG_ATS_PATTERNS) {
      const hit = html.match(pattern);
      if (hit?.[1]) return { platform, slug: decodeURIComponent(hit[1]) };
    }

    const icims = html.match(ICIMS_TENANT_PATTERN);
    if (icims && icims[1] !== "www" && icims[1] !== "careers") {
      return { platform: "icims", tenant: icims[1] };
    }
  }
  return null;
}

// Exported entry point for lib/atsRegistry.ts, which caches the result
// globally so this cost is paid once per company rather than per search.
export async function discoverAtsForRegistry(domain: string): Promise<DiscoveredAts | null> {
  return discoverAtsFromDomain(domain);
}

// Fetches from an already-discovered Workday/iCIMS tenant, skipping
// rediscovery entirely — the registry already knows the connection
// details, so this is a single API call per company.
export async function fetchRegisteredAtsJobs(
  ats: DiscoveredAts,
  companyName: string,
  searchTitle: string
): Promise<NormalizedJob[]> {
  if (ats.platform === "workday") {
    return fetchWorkdayJobs(ats, companyName, searchTitle);
  }
  if (ats.platform === "icims") {
    const words = searchTitle
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2);
    return fetchIcimsJobs(ats, companyName, words);
  }
  return fetchAtsJobs(ats.platform, ats.slug, companyName);
}

type WorkdayJobPosting = {
  title: string;
  externalPath: string;
  locationsText?: string;
};

async function fetchWorkdayJobs(
  discovered: Extract<DiscoveredAts, { platform: "workday" }>,
  companyName: string,
  searchText: string
): Promise<NormalizedJob[]> {
  const { tenant, wdInstance, locale, board } = discovered;
  try {
    // Paginated. This used to send a single `limit: 20, offset: 0` and stop,
    // which quietly capped every Workday employer at TWENTY postings no matter
    // how many they actually had (2026-09-09). Measured consequence: TD Bank
    // contributed 25 rows, BMO 38, CIBC 39, Sun Life 40 -- employers with
    // thousands of open roles. Across a 592k-row index only 211 advisor-type
    // postings existed at all and just 4 near Toronto, so a "Financial Advisor"
    // search returned almost nothing from our own crawl and was carried
    // entirely by LinkedIn and Indeed. The jobs were never missing from the
    // query; they were never fetched.
    //
    // Workday's own portal pages at 20, and returns `total` on every response,
    // so the loop is bounded by real data rather than a guess. MAX_PAGES caps a
    // single company's share of one crawl batch -- a 5,000-posting tenant must
    // not spend the whole run -- and the next pass picks it up again because
    // the crawl orders by oldest-crawled-first.
    const PAGE = 20;
    const MAX_PAGES = 25;
    const postings: WorkdayJobPosting[] = [];
    let total = Infinity;

    for (let page = 0; page < MAX_PAGES && page * PAGE < total; page++) {
      const res = await fetch(`https://${tenant}.${wdInstance}.myworkdayjobs.com/wday/cxs/${tenant}/${board}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appliedFacets: {}, limit: PAGE, offset: page * PAGE, searchText }),
      });
      if (!res.ok) {
        // A later page failing is not the same as the board failing: keep what
        // earlier pages already returned rather than discarding the company.
        console.warn(`[atsProviders] Workday board "${tenant}/${board}" page ${page} returned ${res.status}`);
        break;
      }
      const data: { jobPostings?: WorkdayJobPosting[]; total?: number } = await res.json();
      const batch = data.jobPostings ?? [];
      postings.push(...batch);
      if (typeof data.total === "number") total = data.total;
      // Short page means the end, whatever `total` claimed.
      if (batch.length < PAGE) break;
    }

    return postings.map((job) => {
      const applyUrl = `https://${tenant}.${wdInstance}.myworkdayjobs.com/${locale}/${board}${job.externalPath}`;
      return {
        id: `workday-${job.externalPath}`,
        title: job.title,
        company: companyName,
        location: job.locationsText ?? "",
        description: "",
        url: applyUrl,
        applyUrl,
        postedAt: undefined,
        source: "workday",
      };
    });
  } catch (error) {
    console.warn(`[atsProviders] Workday fetch failed for "${tenant}/${board}"`, error);
    return [];
  }
}

// iCIMS has no confirmed public JSON API (live-checked, not assumed) — but
// real, specific-posting links ARE present in plain server-rendered HTML
// (confirmed live: /jobs/search?ss=1&in_iframe=1 returns real
// /jobs/{numericId}/{slug}/job links with zero JS execution). Parsed via a
// DOM-shaped scan, same tier the browser extension already uses for
// platforms with no JSON API.
//
// Rewritten 2026-09-03 from an href-only scan to per-card parsing, after
// measuring that ALL 19,892 cached iCIMS postings had an empty location —
// 20% of the entire crawl cache, and every one of them excluded from any
// city-specific search once search_discovered_postings started (correctly)
// refusing to treat unknown-location rows as city matches. The location was
// there the whole time and was simply being discarded: each
// `<li class="iCIMS_JobCardItem">` carries a "Job Locations" label followed
// by the value (e.g. "US-NC-Cary HQ", "CA-ON-Toronto"), plus a real
// description snippet and the properly-cased title in an <h3>. Parsing per
// card recovers all three, so these postings become genuinely searchable by
// city instead of being dead weight.
const ICIMS_CARD_PATTERN = /<li class="iCIMS_JobCardItem">([\s\S]*?)<\/li>/gi;
const ICIMS_LINK_PATTERN = /href="(https:\/\/[a-z0-9-]+\.icims\.com\/jobs\/(\d+)\/([^"?]+)\/job[^"]*)"/i;
const ICIMS_LOCATION_PATTERN = /Job Locations<\/span>\s*<span[^>]*>\s*([^<]+)</i;
const ICIMS_TITLE_PATTERN = /<h3[^>]*>\s*([^<]+?)\s*<\/h3>/i;
const ICIMS_DESCRIPTION_PATTERN = /<div class="col-xs-12 description">([\s\S]*?)<\/div>/i;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;/g, "'")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchIcimsJobs(
  discovered: Extract<DiscoveredAts, { platform: "icims" }>,
  companyName: string,
  searchTitleWords: string[]
): Promise<NormalizedJob[]> {
  try {
    const res = await fetch(`https://${discovered.tenant}.icims.com/jobs/search?ss=1&in_iframe=1`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) {
      console.warn(`[atsProviders] iCIMS tenant "${discovered.tenant}" returned ${res.status}`);
      return [];
    }
    const html = await res.text();
    const jobs: NormalizedJob[] = [];
    for (const [, card] of html.matchAll(ICIMS_CARD_PATTERN)) {
      const link = card.match(ICIMS_LINK_PATTERN);
      if (!link) continue;
      const [, applyUrl, id, slug] = link;

      // Prefer the card's own <h3>, which carries real casing and
      // punctuation; the URL slug is a lossy fallback for cards whose
      // heading markup differs.
      const heading = card.match(ICIMS_TITLE_PATTERN)?.[1];
      const title = heading ? stripTags(heading) : decodeURIComponent(slug).replace(/-/g, " ");

      const lowerTitle = title.toLowerCase();
      if (searchTitleWords.length > 0 && !searchTitleWords.every((w) => lowerTitle.includes(w))) continue;

      // `in_iframe=1` is iCIMS's own embedded-widget flag — a scraping
      // artifact that shouldn't be handed to a candidate as their apply
      // link. Measured 2026-09-03 on one real posting: the widget variant
      // serves a stripped-down page (6,233 chars of text) while the same URL
      // without it serves the full posting (13,155), so dropping it gives
      // both a cleaner link and better text for the on-demand
      // full-description fetch (lib/fullDescription.ts).
      const cleanUrl = applyUrl.replace(/[?&]in_iframe=1/i, "").replace(/\?$/, "");

      jobs.push({
        id: `icims-${id}`,
        title,
        company: companyName,
        location: stripTags(card.match(ICIMS_LOCATION_PATTERN)?.[1] ?? ""),
        description: stripTags(card.match(ICIMS_DESCRIPTION_PATTERN)?.[1] ?? ""),
        url: cleanUrl,
        applyUrl: cleanUrl,
        postedAt: undefined,
        source: "icims",
      });
    }
    return jobs;
  } catch (error) {
    console.warn(`[atsProviders] iCIMS fetch failed for "${discovered.tenant}"`, error);
    return [];
  }
}

// Real, live, tenant-scoped search-results URL — confirmed live 2026-08-30
// for both platforms (HTTP 200, genuine company-hosted page, not a 404/
// redirect-to-home): `?q=`/`?searchKeyword=` pre-fills that tenant's own
// search box. Used as a fallback when discovery finds a real ATS tenant
// but no SPECIFIC posting title-matches (e.g. the original listing has
// since been filled/removed) — direct user instruction ("solve this,
// whatever it takes") after a real reported case (TD) where the original
// posting was genuinely gone. Deliberately NOT treated as a "specific
// posting" by looksLikeSpecificJobPosting (no posting id in the URL) — it
// won't block a future re-resolution attempt from finding a real exact
// match later, it's honestly a "here's this employer's real live search,
// filtered to what you were looking for" link, not a claim to be the
// exact original listing.
// Only Workday and iCIMS expose a keyword-filterable public search URL
// that was verified live. The slug-based boards (Greenhouse/Lever/Ashby/
// SmartRecruiters) return their full posting list from the API instead,
// so an exact-match miss there means the posting genuinely isn't on that
// board — there's no useful "search page" to fall back to, and inventing
// one would just be a guess.
function fallbackSearchUrl(discovered: DiscoveredAts, searchTitle: string): string | null {
  if (discovered.platform === "workday") {
    return `https://${discovered.tenant}.${discovered.wdInstance}.myworkdayjobs.com/${discovered.locale}/${discovered.board}?q=${encodeURIComponent(searchTitle)}`;
  }
  if (discovered.platform === "icims") {
    return `https://${discovered.tenant}.icims.com/jobs/search?ss=1&searchKeyword=${encodeURIComponent(searchTitle)}`;
  }
  return null;
}

export type DiscoveredAtsResult = { jobs: NormalizedJob[]; fallbackSearchUrl: string | null };

// Entry point: given a real company domain (NOT a guessed slug — see
// lib/applyLinkTrust.ts's extractLikelyLogoDomain, which resolves one from
// a job's own already-employer-classified apply link), discover and query
// whichever ATS that company actually uses. Returns an empty result and
// never throws if none is detected — a normal, expected outcome for most
// companies, not an error.
export async function fetchDiscoveredAtsJobs(domain: string, companyName: string, searchTitle: string): Promise<DiscoveredAtsResult> {
  const discovered = await discoverAtsFromDomain(domain);
  if (!discovered) return { jobs: [], fallbackSearchUrl: null };

  const jobs = await fetchRegisteredAtsJobs(discovered, companyName, searchTitle);
  return { jobs, fallbackSearchUrl: fallbackSearchUrl(discovered, searchTitle) };
}

// Best-effort slug guesses for a company name, tried across all three
// platforms in reresolveApplyLink.ts's lazy-fix path when a job's stored
// apply link is low-quality — same sanitization idea as
// components/shared/CompanyLogo.tsx's guessCompanyDomain, applied to a
// board slug instead of a domain. Two variants since real board slugs split
// both ways on legal-suffix words, same reasoning as
// lib/applyLinkTrust.ts's employerSlugs().
export function guessCompanySlugs(company: string): string[] {
  const lower = company.toLowerCase();
  const bare = lower.replace(/[^a-z0-9]/g, "");
  const stripped = lower
    .replace(/\b(inc|llc|ltd|corp|co|company|group|holdings|canada|ulc)\b\.?/g, "")
    .replace(/[^a-z0-9]/g, "");
  return Array.from(new Set([bare, stripped])).filter((s) => s.length > 1);
}
