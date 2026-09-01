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
function buildRelevanceQuery(profile: Pick<Profile, "skills" | "job_titles_seeking">): string | null {
  const terms = [...(profile.skills ?? []), ...(profile.job_titles_seeking ?? [])]
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
): Promise<string[]> {
  if (jobIds.length === 0) return [];

  const query = buildRelevanceQuery(profile);
  if (!query) return jobIds; // no profile signal to rank against — leave order unchanged

  const { data, error } = await admin.database.rpc("rank_jobs_by_relevance", {
    p_job_ids: jobIds,
    p_query: query,
  });

  if (error) {
    console.error("[jobRelevance] rank_jobs_by_relevance failed, falling back to unranked order", error.message);
    return jobIds;
  }

  const ranked = (data as RankedJobId[]).sort((a, b) => b.rank - a.rank);
  return ranked.map((r) => r.id);
}
