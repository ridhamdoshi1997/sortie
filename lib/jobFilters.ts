import type { Job } from "@/types";

// Structured search filters for the Find & Evaluate page (Phase 11 filter-bar
// rebuild, researched via agy against LinkedIn/Indeed/Wellfound/Otta/JobRight/
// Teal/Glassdoor/ZipRecruiter). Two filters map to SerpApi's own query params
// (title/location already did this; datePosted joins them via `chips` — see
// lib/jobScraper.ts) since fetching stale postings just to filter them out
// client-side wastes a paid API call. Everything else here is free: it runs
// against jobs already fetched and scored, using data already extracted at
// zero marginal cost (seniority_level, match_score) or a cheap client-side
// parse (salary, remote policy, visa-sponsorship heuristic).
export type DatePosted = "any" | "today" | "3days" | "week" | "month";
export type RemotePolicy = "remote" | "hybrid" | "onsite";
export type JobType = "Full-time" | "Part-time" | "Contract" | "Internship";
export type ExperienceLevel = "Entry-level" | "Mid-level" | "Senior" | "Lead" | "Executive";

// Which sources a candidate wants to see. Empty means all of them.
//
// Added 2026-09-09 on direct request. It is a genuinely different question
// from the other filters: those narrow WHAT the job is, this narrows WHERE it
// came from -- and the answer changes what a candidate trusts. An ATS posting
// links to the employer's own board; a LinkedIn or Indeed row is an aggregator
// copy that may already be closed. Some people want only the direct ones;
// others open with the aggregators because that is what they recognise.
export type JobSource = "linkedin" | "indeed" | "direct";

export type SearchFilters = {
  datePosted: DatePosted;
  source: JobSource[];
  remotePolicy: RemotePolicy[];
  jobType: JobType[];
  salaryMin: number | null;
  experienceLevel: ExperienceLevel[];
  minMatchScore: number | null;
  hideKeyword: string;
  company: string;
  visaSponsorshipOnly: boolean;
};

export const DEFAULT_FILTERS: SearchFilters = {
  datePosted: "any",
  source: [],
  remotePolicy: [],
  jobType: [],
  salaryMin: null,
  experienceLevel: [],
  minMatchScore: null,
  hideKeyword: "",
  company: "",
  visaSponsorshipOnly: false,
};

export function countActiveFilters(filters: SearchFilters): number {
  let count = 0;
  if (filters.datePosted !== "any") count++;
  if (filters.source.length > 0) count++;
  if (filters.remotePolicy.length > 0) count++;
  if (filters.jobType.length > 0) count++;
  if (filters.salaryMin !== null) count++;
  if (filters.experienceLevel.length > 0) count++;
  if (filters.minMatchScore !== null) count++;
  if (filters.hideKeyword.trim()) count++;
  if (filters.company.trim()) count++;
  if (filters.visaSponsorshipOnly) count++;
  return count;
}

// Extracts the lowest real dollar figure from a free-text salary string
// (SerpApi's detected_extensions.salary, e.g. "$100K–$150K a year",
// "$70 - $80 / Hour", "$88,000 - $132,000"). Hourly figures are annualized
// (× 2080, a standard full-time-hours-per-year approximation) so a $100k/yr
// minimum filter compares like with like against an hourly posting — without
// this an hourly role's real $150k-equivalent rate would read as "$70" and
// get wrongly filtered out.
export function parseSalaryMinValue(salaryText: string | null): number | null {
  if (!salaryText) return null;
  const isHourly = /\/\s*hour|per hour|hourly|\bhr\b/i.test(salaryText);
  const numbers = salaryText
    .replace(/,/g, "")
    .match(/\$?(\d+(?:\.\d+)?)\s*(k)?/gi);
  if (!numbers || numbers.length === 0) return null;

  const parsed = numbers
    .map((match) => {
      const isK = /k$/i.test(match.trim());
      const value = parseFloat(match.replace(/[^\d.]/g, ""));
      if (Number.isNaN(value)) return null;
      return isK ? value * 1000 : value;
    })
    .filter((n): n is number => n !== null);

  if (parsed.length === 0) return null;
  const min = Math.min(...parsed);
  return isHourly ? Math.round(min * 2080) : Math.round(min);
}

// SerpApi's location string and job title are the only real remote/hybrid/
// onsite signal available (no dedicated field) — same approach the existing
// "remote" city-match fallback in jobScraper.ts already relies on.
function matchesRemotePolicy(job: Job, selected: RemotePolicy[]): boolean {
  if (selected.length === 0) return true;
  const haystack = `${job.location ?? ""} ${job.title ?? ""}`.toLowerCase();
  return selected.some((policy) => {
    if (policy === "remote") return /\bremote\b|\banywhere\b/.test(haystack);
    if (policy === "hybrid") return /\bhybrid\b/.test(haystack);
    // Onsite is the absence of remote/hybrid language, not a positive
    // keyword — most postings never say "onsite" explicitly.
    return !/\bremote\b|\bhybrid\b|\banywhere\b/.test(haystack);
  });
}

function matchesJobType(job: Job, selected: JobType[]): boolean {
  if (selected.length === 0) return true;
  if (!job.job_type) return false;
  const normalized = job.job_type.toLowerCase();
  return selected.some((type) => normalized.includes(type.toLowerCase()));
}

// jobs.seniority_level already holds the AI evaluator's own extracted label
// (e.g. "Senior", "Entry-level") — bucket it into the fixed filter set
// rather than exact string matching, since the evaluator's wording varies
// posting to posting.
function matchesExperienceLevel(job: Job, selected: ExperienceLevel[]): boolean {
  if (selected.length === 0) return true;
  if (!job.seniority_level) return false;
  const normalized = job.seniority_level.toLowerCase();
  return selected.some((level) => {
    if (level === "Entry-level") return /entry|junior|associate|intern/.test(normalized);
    if (level === "Mid-level") return /mid|intermediate/.test(normalized);
    if (level === "Senior") return /senior|sr\./.test(normalized) && !/staff|principal|lead/.test(normalized);
    if (level === "Lead") return /lead|staff|principal|manager|director/.test(normalized);
    return /executive|vp|chief|head of/.test(normalized);
  });
}

// Real, free-text signal against known sponsorship-related phrasing — SerpApi
// never returns a structured visa field, this is the only option short of an
// added AI call. Kept as a hard include filter distinct from the free-text
// visa_sponsorship instruction still passed to the AI evaluator (that stays
// as score-nuance context, not exclusion — see actions/scraper flow).
const SPONSORSHIP_POSITIVE = /\b(h-?1b|sponsorship|sponsor(?:s|ing)?|tn visa|opt|cpt|work visa)\b/i;
const SPONSORSHIP_NEGATIVE = /\b(no sponsorship|cannot sponsor|unable to sponsor|us citizens? only|must be authorized to work without sponsorship|not able to sponsor)\b/i;

export function looksLikeVisaSponsorship(text: string | null): boolean {
  if (!text) return false;
  if (SPONSORSHIP_NEGATIVE.test(text)) return false;
  return SPONSORSHIP_POSITIVE.test(text);
}

function matchesHideKeyword(job: Job, keyword: string): boolean {
  const trimmed = keyword.trim();
  if (!trimmed) return true;
  const haystack = `${job.title ?? ""} ${job.company ?? ""} ${job.about_role ?? ""}`.toLowerCase();
  return !haystack.includes(trimmed.toLowerCase());
}

function matchesCompany(job: Job, company: string): boolean {
  const trimmed = company.trim();
  if (!trimmed) return true;
  return (job.company ?? "").toLowerCase().includes(trimmed.toLowerCase());
}

// URL-backed filter state (competitor standard per agy research — a
// searchable/filtered search is shareable/bookmarkable, not lost on
// refresh). Only writes keys that differ from the default so a fresh
// unfiltered search keeps a clean URL.
export function filtersToSearchParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.datePosted !== "any") params.set("datePosted", filters.datePosted);
  if (filters.source.length > 0) params.set("source", filters.source.join(","));
  if (filters.remotePolicy.length > 0) params.set("remote", filters.remotePolicy.join(","));
  if (filters.jobType.length > 0) params.set("jobType", filters.jobType.join(","));
  if (filters.salaryMin !== null) params.set("salaryMin", String(filters.salaryMin));
  if (filters.experienceLevel.length > 0) params.set("experience", filters.experienceLevel.join(","));
  if (filters.minMatchScore !== null) params.set("minScore", String(filters.minMatchScore));
  if (filters.hideKeyword.trim()) params.set("hide", filters.hideKeyword.trim());
  if (filters.company.trim()) params.set("company", filters.company.trim());
  if (filters.visaSponsorshipOnly) params.set("visa", "1");
  return params;
}

export function searchParamsToFilters(params: URLSearchParams): SearchFilters {
  const datePosted = params.get("datePosted");
  const source = params.get("source");
  const remote = params.get("remote");
  const jobType = params.get("jobType");
  const experience = params.get("experience");
  const salaryMin = params.get("salaryMin");
  const minScore = params.get("minScore");

  return {
    datePosted: (["today", "3days", "week", "month"] as string[]).includes(datePosted ?? "")
      ? (datePosted as DatePosted)
      : "any",
    remotePolicy: remote ? (remote.split(",").filter(Boolean) as RemotePolicy[]) : [],
    jobType: jobType ? (jobType.split(",").filter(Boolean) as JobType[]) : [],
    source: source
      ? (source.split(",").filter((v) => ["linkedin", "indeed", "direct"].includes(v)) as JobSource[])
      : [],
    salaryMin: salaryMin ? Number(salaryMin) : null,
    experienceLevel: experience ? (experience.split(",").filter(Boolean) as ExperienceLevel[]) : [],
    minMatchScore: minScore ? Number(minScore) : null,
    hideKeyword: params.get("hide") ?? "",
    company: params.get("company") ?? "",
    visaSponsorshipOnly: params.get("visa") === "1",
  };
}

// Anything that is not LinkedIn or Indeed came from an employer's own applicant
// tracking system, so "direct" is the complement rather than a list of platform
// names -- new ATS integrations then need no change here.
function matchesSource(job: Job, selected: JobSource[]): boolean {
  if (selected.length === 0) return true;
  const raw = (job.source ?? "").trim().toLowerCase();
  const actual: JobSource = raw === "linkedin" ? "linkedin" : raw === "indeed" ? "indeed" : "direct";
  return selected.includes(actual);
}

export function applyClientFilters(jobs: Job[], filters: SearchFilters): Job[] {
  return jobs.filter((job) => {
    if (!matchesSource(job, filters.source)) return false;
    if (!matchesRemotePolicy(job, filters.remotePolicy)) return false;
    if (!matchesJobType(job, filters.jobType)) return false;
    if (!matchesExperienceLevel(job, filters.experienceLevel)) return false;
    if (!matchesHideKeyword(job, filters.hideKeyword)) return false;
    if (!matchesCompany(job, filters.company)) return false;

    if (filters.salaryMin !== null) {
      const jobSalaryMin = parseSalaryMinValue(job.salary);
      // A job with no salary data at all is excluded once a minimum is set —
      // "at least $X" can't be confirmed true for a posting that states no
      // figure, so silently including it would misrepresent the filter.
      if (jobSalaryMin === null || jobSalaryMin < filters.salaryMin) return false;
    }

    if (filters.minMatchScore !== null) {
      if (job.match_score === null || job.match_score < filters.minMatchScore) return false;
    }

    if (filters.visaSponsorshipOnly) {
      const text = `${job.about_role ?? ""} ${job.requirements.join(" ")} ${job.nice_to_have.join(" ")}`;
      if (!looksLikeVisaSponsorship(text)) return false;
    }

    return true;
  });
}
