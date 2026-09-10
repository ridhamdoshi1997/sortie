import { createCacheDbClient } from "@/lib/admin/client";
import { queryProactiveCrawlCache } from "@/lib/proactiveAtsCrawl";
import type { NormalizedJob } from "@/lib/jobScraper";

// The "Recommended" tab (2026-09-10) — a profile-driven feed, not a search
// form. Deliberately reads ONLY the free crawl cache (queryProactiveCrawlCache
// -- the same cache-first path /find-jobs already warms on every real
// search, see lib/proactiveAtsCrawl.ts) and never touches a paid source
// (Apify/SerpApi/TheirStack) or the paid AI evaluator. A tab a user might
// open every time they check the app is exactly the kind of passive,
// high-frequency surface that must not carry a per-view dollar cost — see
// the standing cost-discipline rule this codebase already follows for other
// opt-in-paid features. Cards here have no match_score for the same reason;
// "matchedSkills" below is a literal keyword overlap against the profile,
// computed for free, never an AI claim.

export type RecommendedJob = NormalizedJob & { matchedSkills: string[] };

export type RecommendationInput = {
  jobTitlesSeeking: string[] | null;
  currentTitle: string | null;
  skills: string[] | null;
  preferredLocations: string[] | null;
  location: string | null;
};

export type RecommendationResult = {
  jobs: RecommendedJob[];
  searchedTitles: string[];
  hasSignal: boolean;
};

const MAX_TITLES = 3;
const PER_TITLE_LIMIT = 15;
const MAX_TOTAL = 60;

function dedupe(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Set<string>();
  const out: NormalizedJob[] = [];
  for (const job of jobs) {
    const key = job.id || `${job.company}::${job.title}::${job.location}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

function matchedSkillsFor(job: NormalizedJob, skills: string[]): string[] {
  const haystack = `${job.title} ${job.description ?? ""}`.toLowerCase();
  return skills.filter((skill) => skill && haystack.includes(skill.toLowerCase())).slice(0, 5);
}

export async function getRecommendedJobs(input: RecommendationInput): Promise<RecommendationResult> {
  const seeking = (input.jobTitlesSeeking ?? []).filter(Boolean);
  const titles = (seeking.length > 0 ? seeking : input.currentTitle ? [input.currentTitle] : []).slice(
    0,
    MAX_TITLES,
  );

  if (titles.length === 0) {
    return { jobs: [], searchedTitles: [], hasSignal: false };
  }

  // Single primary location across all titles, not a per-title location
  // matrix — keeps this to `titles.length` cache calls rather than
  // multiplying by location count too. A real, disclosed scope limit, not
  // an oversight: revisit if candidates with multiple genuinely different
  // target locations report thin results.
  const location = (input.preferredLocations ?? []).find(Boolean) || input.location || "Remote";
  const skills = (input.skills ?? []).filter(Boolean);

  const cacheDb = createCacheDbClient();
  const batches = await Promise.all(
    titles.map((title) =>
      queryProactiveCrawlCache(cacheDb, title, location, PER_TITLE_LIMIT).catch((error) => {
        console.error("[jobRecommendations] cache query failed", title, error);
        return [] as NormalizedJob[];
      }),
    ),
  );

  const merged = dedupe(batches.flat())
    .sort((a, b) => new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime())
    .slice(0, MAX_TOTAL);

  const jobs: RecommendedJob[] = merged.map((job) => ({ ...job, matchedSkills: matchedSkillsFor(job, skills) }));

  return { jobs, searchedTitles: titles, hasSignal: true };
}
