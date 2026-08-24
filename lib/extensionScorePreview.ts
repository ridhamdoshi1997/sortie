import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import type { Profile } from "@/types";

// Extension inline match-score badge — a deliberately cheap, fast cousin of
// lib/evaluator.ts's full 10-dimension evaluateJobCompatibility, not a
// replacement for it. The full evaluator is batch-oriented (Inngest,
// ~10000 max tokens, run once per job when it's actually saved/searched);
// this fires on every job posting page the user merely BROWSES, so it needs
// to be small and fast. app/api/extension/score-preview/route.ts only calls
// this on a genuine cache miss (no existing tracked job with the same
// title+company already has a score) — a real saved job's own match_score
// is reused for free instead of a second AI call for the same role.

export type ScorePreviewResult = {
  matchScore: number; // 0-100, same scale as jobs.match_score (recommendationScore * 20)
  missingSkills: string[]; // top 3-5, for the popup's "missing keywords" list
};

// missingSkills has no upper-bound validation — the model reliably overshoots
// "up to 5" in the prompt (confirmed live: a real response came back with 6),
// and failing the whole preview over a soft prompt instruction being off by
// one is worse than just truncating. The slice to 5 happens after parsing.
const previewSchema = z.object({
  preview: z.object({
    matchScore: z.number().min(0).max(100),
    missingSkills: z.array(z.string().min(1)),
  }),
});

function fallbackPreview(): ScorePreviewResult {
  return { matchScore: 0, missingSkills: [] };
}

function buildCandidateSummary(profile: Profile): string {
  return `Current title: ${profile.current_title ?? "Unknown"}
Experience level: ${profile.experience_level ?? "Unknown"}
Years of experience: ${profile.years_experience ?? "Unknown"}
Skills: ${(profile.skills ?? []).join(", ") || "None listed"}
Roles they're targeting: ${(profile.job_titles_seeking ?? []).join(", ") || "Unspecified"}`;
}

export const SYSTEM_PROMPT = `You are a fast, rough job-fit scorer for a browser extension badge — the user is browsing a job posting, not applying yet. Give a quick, honest estimate, not a rigorous multi-dimension analysis.

Score 0-100 based on how well the candidate's skills/experience/title align with the posting's stated requirements. Be honest — a mismatched posting should score low, don't inflate to be encouraging. List up to 5 concrete skills/requirements the posting mentions that the candidate's profile doesn't show.

Return ONLY valid JSON matching this exact shape:
{ "preview": { "matchScore": number, "missingSkills": ["string"] } }`;

export async function generateScorePreview(
  profile: Profile,
  job: { title: string; company: string; description: string },
  provider: ModelProvider = "gemini",
): Promise<ScorePreviewResult> {
  const userPrompt = `CANDIDATE:
${buildCandidateSummary(profile)}

JOB POSTING:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description.slice(0, 4000)}`;

  const raw = await complete(getModel(provider, "fast"), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.2,
    maxTokens: 500,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/extensionScorePreview] JSON parse failed", error);
    return fallbackPreview();
  }

  const result = previewSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/extensionScorePreview] schema validation failed", result.error);
    return fallbackPreview();
  }

  return {
    matchScore: result.data.preview.matchScore,
    missingSkills: result.data.preview.missingSkills.slice(0, 5),
  };
}
