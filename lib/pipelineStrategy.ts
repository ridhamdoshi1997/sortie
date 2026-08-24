import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import { STAGE_ORDER, STATUS_LABELS, type ApplicationStatus } from "@/lib/applicationStatus";
import { getListingSignal } from "@/lib/jobStatus";

// Pipeline Strategy Read (build-plan.md §H, "AI heavy dashboard" direct
// request) — the dashboard's own funnel/match-score data has never been
// cross-analyzed before; the existing Skill Gap Tracker/Market Readiness/
// Outcome Insights AI summaries all live on /career and look at different
// data (missing-skill patterns, accomplishments-vs-targets, historical
// interview rate by score band). This looks at the CURRENT pipeline
// snapshot specifically — where jobs are sitting right now and whether the
// highest-scored ones are actually being acted on — genuinely dashboard-
// only ground. Same "aggregate real data for free, then one opt-in AI
// synthesis call" shape as every other AI widget in this app.

export type PipelineStageSnapshot = {
  stage: ApplicationStatus;
  label: string;
  count: number;
  avgMatchScore: number | null;
};

export type PipelineSnapshot = {
  stages: PipelineStageSnapshot[];
  // Real jobs sitting in Shortlisted (the first real pipeline stage — see
  // lib/applicationStatus.ts's Inbox/Pipeline split) with a strong match
  // score (80+) — the clearest actionable signal this snapshot can surface:
  // good matches going untouched.
  highMatchShortlistedCount: number;
  totalActive: number;
};

const MIN_ACTIVE_JOBS_FOR_READ = 5;

type SnapshotJob = {
  application_status: ApplicationStatus;
  match_score: number | null;
  is_hidden: boolean;
  marked_unavailable_at: string | null;
  dropped_from_search_at: string | null;
  found_at: string | null;
};

// Real bug (direct user report): both this snapshot and the AI read built
// on top of it were counting jobs the Action Center itself already flags
// as "may no longer be available" (lib/dashboardInsights.ts's own
// needs-attention signal) as live pipeline backlog — one real test account
// had ~973 Draft jobs, and a large share of that pile was dead postings,
// not a genuine bottleneck. Same confirmed/likely threshold as the Action
// Center (not the lower-confidence age-only "possible" signal — a listing
// just being 45+ days old isn't real evidence it's gone, and excluding
// those too would hide genuinely-active old postings from a strategy
// read that's supposed to be about the real pipeline).
//
// A second, structural fix on top of that (Inbox/Pipeline split, same
// direct user request, `agy`-researched): jobs still sitting untriaged in
// "inbox" are excluded entirely, not just the stale ones — a job the user
// hasn't reviewed yet was never real pipeline backlog in the first place.
// STAGE_ORDER no longer includes "inbox" at all, so this snapshot is
// pipeline-only by construction.
export function computePipelineSnapshot(jobs: SnapshotJob[]): PipelineSnapshot {
  const active = jobs.filter((j) => {
    if (j.is_hidden || j.application_status === "inbox") return false;
    const signal = getListingSignal(j);
    return signal?.level !== "confirmed" && signal?.level !== "likely";
  });

  const stages: PipelineStageSnapshot[] = STAGE_ORDER.map((stage) => {
    const inStage = active.filter((j) => j.application_status === stage);
    const scored = inStage.filter((j) => j.match_score !== null) as (SnapshotJob & { match_score: number })[];
    const avgMatchScore =
      scored.length > 0 ? Math.round(scored.reduce((sum, j) => sum + j.match_score, 0) / scored.length) : null;
    return { stage, label: STATUS_LABELS[stage], count: inStage.length, avgMatchScore };
  });

  const highMatchShortlistedCount = active.filter(
    (j) => j.application_status === "shortlisted" && (j.match_score ?? 0) >= 80,
  ).length;

  return { stages, highMatchShortlistedCount, totalActive: active.length };
}

export type PipelineStrategyResult = {
  observations: string[]; // 1-2 sentences, grounded only in the supplied real snapshot
};

const resultSchema = z.object({
  observations: z.array(z.string().min(1)).min(1).max(2),
});

function fallbackResult(): PipelineStrategyResult {
  return { observations: ["Automated analysis failed — try again in a moment."] };
}

const SYSTEM_PROMPT = `You are looking at a real snapshot of a candidate's current job-application pipeline — real counts of how many jobs sit in each stage (Shortlisted, Applied, Interviewing, Offer, Rejected) right now, plus the average match score of the jobs in each stage, and how many strong-match (80+) jobs are sitting untouched in Shortlisted. Jobs the candidate hasn't reviewed yet (still in their Inbox) are already excluded — everything you see here is something they've actively decided to pursue.

Rules:
- 1-2 observations only, each grounded ONLY in the specific numbers given — never invent a percentage, a market trend, or a claim this candidate can't verify from their own pipeline.
- Focus on genuine STRATEGY signal: is there a bottleneck (e.g. a large Shortlisted pile but few Applied), are high-match jobs being acted on or left untouched, does match score look meaningfully different between stages (e.g. Interviewing jobs scoring much higher than Rejected ones is a real, worth-naming signal that the evaluator is tracking real outcomes).
- If the pipeline is thin or the pattern is genuinely unremarkable, say that honestly instead of forcing a conclusion.
- Never use vague encouragement ("keep up the good work") — always name a concrete number from the data.

Return ONLY valid JSON: { "observations": ["string"] }`;

export async function generatePipelineStrategyRead(
  snapshot: PipelineSnapshot,
  provider: ModelProvider = "gemini",
): Promise<PipelineStrategyResult> {
  const userPrompt = `Current pipeline snapshot, ${snapshot.totalActive} active (non-hidden, already-triaged) jobs total:
${snapshot.stages.map((s) => `- ${s.label}: ${s.count} job${s.count === 1 ? "" : "s"}${s.avgMatchScore !== null ? `, average match score ${s.avgMatchScore}` : ""}`).join("\n")}

Strong-match (80+) jobs still sitting in Shortlisted, untouched: ${snapshot.highMatchShortlistedCount}`;

  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
    maxTokens: 600,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/pipelineStrategy] JSON parse failed", error);
    return fallbackResult();
  }

  const result = resultSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/pipelineStrategy] schema validation failed", result.error);
    return fallbackResult();
  }

  return result.data;
}

export { MIN_ACTIVE_JOBS_FOR_READ };
