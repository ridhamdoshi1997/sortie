import type { NormalizedJob } from "@/lib/jobScraper";

// Direct Applicant Tracking System adapters (build-plan.md's Phase 8 —
// Portal Scanner, "24 ATS Provider Adapters"). Each hits the platform's own
// public, unauthenticated job-board API — the apply URL in the response IS
// the employer's real posting, not a candidate to run through
// lib/applyLinkTrust.ts's classifier. All three endpoints verified live
// against real company boards before this file was written (stripe/
// greenhouse, Lever's own demo board, ramp/ashby) — see this session's
// transcript / the approved plan for the raw responses.

export type AtsPlatform = "greenhouse" | "lever" | "ashby";

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

export async function fetchAtsJobs(platform: AtsPlatform, slug: string, companyName: string): Promise<NormalizedJob[]> {
  switch (platform) {
    case "greenhouse":
      return fetchGreenhouseJobs(slug, companyName);
    case "lever":
      return fetchLeverJobs(slug, companyName);
    case "ashby":
      return fetchAshbyJobs(slug, companyName);
  }
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
