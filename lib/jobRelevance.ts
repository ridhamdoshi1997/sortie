// Relevance pre-filter (2026-08-31 research day) — the free replacement
// for an embeddings-based pre-filter, settled after two independent AI
// research passes both concluded embeddings weren't justified at this
// product's current scale (still real API calls, still counts against the
// exact rate limits already fixed today, plus new infra — pgvector,
// embedding lifecycle — for marginal gain here). This reuses the
// full-text search infrastructure that already exists
// (migrations/20260828180000_add-full-text-job-search.sql's
// jobs.search_vector) via a small new RPC
// (migrations/20260901000610_add-relevance-ranking.sql) instead.
//
// Ranks against the CANDIDATE's own structured profile fields (skills,
// desired job titles) — real data that exists before any AI evaluation
// ever runs — not a job's own AI-extracted fields (requirements,
// seniority_level, etc.), which only exist AFTER evaluation and would
// make a pre-evaluation filter circular.
import type { Profile } from "@/types";

type AdminDb = {
  database: {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
};

// websearch_to_tsquery treats bare words as AND by default; joining with
// "or" broadens this to "matches ANY of the candidate's real skills/
// desired titles" — the right behavior for a relevance RANKING (more
// matched terms should rank higher), not a strict pass/fail filter.
function buildRelevanceQuery(
  profile: Pick<Profile, "skills" | "job_titles_seeking">,
  searchedTitle?: string | null,
): string | null {
  // The SEARCHED title leads, when there is one.
  //
  // Ranking against the profile alone is the wrong yardstick the moment a
  // candidate searches outside their own history -- a deliberate career
  // pivot. Measured live: a .NET/C#/Angular profile against a real set of
  // 85 Financial Advisor listings produces zero overlap on every row, so a
  // profile-only ranking has no signal at all in exactly the case a user is
  // most deliberately expressing intent.
  //
  // Both together is better than either alone: every result already matches
  // the searched title (filterByTitleRelevance ran upstream), so the title
  // terms rank within that set while the profile terms lift the ones that
  // also touch what the candidate actually knows.
  const terms = [
    ...(searchedTitle ? [searchedTitle] : []),
    ...(profile.skills ?? []),
    ...(profile.job_titles_seeking ?? []),
  ]
    .map((t) => t.trim())
    .filter(Boolean);
  if (terms.length === 0) return null;
  return terms.join(" or ");
}

export type RankedJobId = { id: string; rank: number };

// Returns job ids ordered by relevance to the candidate's own profile,
// most relevant first. A job with zero term overlap still comes back
// (rank 0) rather than being excluded — this ranks priority for a limited
// evaluation budget, it never hard-excludes a job the way the Phase 2
// pre-filter does.
export async function rankJobsByRelevance(
  admin: AdminDb,
  jobIds: string[],
  profile: Pick<Profile, "skills" | "job_titles_seeking">,
  /** The title the user actually searched, when the caller knows it. */
  searchedTitle?: string | null,
): Promise<string[]> {
  if (jobIds.length === 0) return [];

  const query = buildRelevanceQuery(profile, searchedTitle);
  if (!query) return jobIds; // no profile signal to rank against — leave order unchanged

  const { data, error } = await admin.database.rpc("rank_jobs_by_relevance", {
    p_job_ids: jobIds,
    p_query: query,
  });

  if (error) {
    console.error("[jobRelevance] rank_jobs_by_relevance failed, falling back to unranked order", error.message);
    return jobIds;
  }

  const rows = data as RankedJobId[];

  // No signal at all -- every job scored exactly 0 -- means the candidate's
  // terms overlap nothing in this result set. That is the NORMAL case for a
  // deliberate career pivot (a .NET profile searching "Financial Advisor"),
  // not an error.
  //
  // Return the caller's own order untouched when that happens. Sorting an
  // all-zero list is a sort on equal keys, so the output would be whatever
  // order Postgres happened to return rows in -- unordered by definition,
  // since the RPC has no ORDER BY. Adopting that would silently REPLACE a
  // caller's meaningful order (found_at on the results page) with an
  // arbitrary one, which is a regression dressed up as a ranking.
  if (rows.length === 0 || rows.every((r) => !(Number(r.rank) > 0))) return jobIds;

  const ranked = [...rows].sort((a, b) => b.rank - a.rank);
  return ranked.map((r) => r.id);
}
