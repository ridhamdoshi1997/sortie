import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import { CATEGORY_LABELS } from "@/lib/rejectionIntelligence";
import type { GradeStat, MatchScoreBandStat, RejectionCategoryStat } from "@/lib/outcomeInsights";

// §Q3's optional AI synthesis step — turns the already-computed, already-
// honest aggregate numbers (lib/outcomeInsights.ts) into 1-2 plain-English
// observations. Same honesty-scoped/grounded-only pattern as
// lib/rejectionIntelligence.ts and lib/leverageSynthesizer.ts: the model
// only ever sees the user's OWN aggregated numbers, never invents a market
// benchmark or a claim the numbers don't support.

export type OutcomeNarrativeResult = {
  observations: string[]; // 1-2 sentences, each citing a real number from the input
};

const narrativeSchema = z.object({
  observations: z.array(z.string().min(1)).min(1).max(2),
});

function fallbackNarrative(): OutcomeNarrativeResult {
  return {
    observations: ["Automated insight generation failed — the stat cards above are still accurate, just without a written summary."],
  };
}

function buildStatsText(
  byMatchBand: MatchScoreBandStat[],
  byGrade: GradeStat[],
  rejectionReasons: RejectionCategoryStat[],
): string {
  const bandLines = byMatchBand
    .map((s) => `- Match score ${s.band}: ${s.interviewed}/${s.applied} applications reached an interview (${s.rate}%)`)
    .join("\n");
  const gradeLines = byGrade
    .map((s) => `- Grade ${s.grade}: ${s.interviewed}/${s.applied} applications reached an interview (${s.rate}%)`)
    .join("\n");
  const reasonLines = rejectionReasons
    .map((s) => `- ${CATEGORY_LABELS[s.category]}: cited in ${s.count} rejection${s.count === 1 ? "" : "s"}`)
    .join("\n");

  return `Interview rate by match score band:
${bandLines || "Not enough data yet."}

Interview rate by evaluation grade:
${gradeLines || "Not enough data yet."}

Rejection reason distribution (from this app's own per-job diagnoses):
${reasonLines || "No rejection diagnoses on record yet."}`;
}

export const SYSTEM_PROMPT = `You are summarizing a job candidate's OWN historical application-outcome statistics for them. This is self-referential pattern data from their own tracked applications — never a market benchmark, never data about other candidates, never something you have real access to beyond what's given.

Rules:
- Every observation must cite a specific number from the supplied stats (a percentage, a count, a band/grade name) — never a vague generality.
- 1-2 observations only. Each should surface something genuinely useful to notice (e.g. a real gap between two bands/grades, or a dominant rejection reason) — not just restate every number.
- Never speculate about causes beyond what the stats directly show. If match score correlates with interview rate, say so — don't invent a reason WHY beyond what the data itself implies.
- Never compare to any outside benchmark, industry average, or claim about "most candidates" — you only have this one person's own numbers.
- Plain, direct language. No filler, no encouragement-for-its-own-sake.

Return ONLY valid JSON matching this exact shape:
{ "observations": ["string", "string"] }`;

export async function generateOutcomeNarrative(
  byMatchBand: MatchScoreBandStat[],
  byGrade: GradeStat[],
  rejectionReasons: RejectionCategoryStat[],
  provider: ModelProvider = "gemini",
): Promise<OutcomeNarrativeResult> {
  const userPrompt = `THE CANDIDATE'S OWN APPLICATION-OUTCOME STATS:\n${buildStatsText(byMatchBand, byGrade, rejectionReasons)}`;

  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
    maxTokens: 800,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/outcomeNarrative] JSON parse failed", error);
    return fallbackNarrative();
  }

  const result = narrativeSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/outcomeNarrative] schema validation failed", result.error);
    return fallbackNarrative();
  }

  return result.data;
}
