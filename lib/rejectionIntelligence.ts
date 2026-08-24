import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import type { EvaluationDimensionResult } from "@/lib/evaluator";

// A candidate can never actually know why a specific employer went silent —
// there's no feedback loop. This module's whole job is to stay honest about
// that: every possible reason must be grounded in the job's own stored
// evaluation (dimensions/notes/missing skills already produced by
// lib/evaluator.ts, not a fresh guess), and the UI must present this as
// "possible explanations", never a verdict. Same schema+fallback idiom as
// lib/evaluator.ts's jobEvaluationSchema/fallbackEvaluation.

export type RejectionReasonCategory =
  | "skills_gap"
  | "seniority_mismatch"
  | "compensation_mismatch"
  | "market_conditions"
  | "application_volume"
  | "unclear_from_available_data";

export const CATEGORY_LABELS: Record<RejectionReasonCategory, string> = {
  skills_gap: "Skills gap",
  seniority_mismatch: "Seniority mismatch",
  compensation_mismatch: "Compensation mismatch",
  market_conditions: "Market conditions",
  application_volume: "High application volume",
  unclear_from_available_data: "Unclear from available data",
};

export type RejectionDiagnosisResult = {
  possibleReasons: {
    category: RejectionReasonCategory;
    explanation: string; // grounded in this job's actual evaluation data
  }[];
  suggestedNextAction: string;
  confidenceNote: string; // always states the real limitation — no employer feedback exists
};

export type RejectionIntelligenceJob = {
  id: string;
  title: string | null;
  company: string | null;
  description: string | null;
  evaluation: EvaluationDimensionResult[] | null;
  missing_skills: string[] | null;
  application_status_updated_at: string | null;
};

const reasonSchema = z.object({
  category: z.enum([
    "skills_gap",
    "seniority_mismatch",
    "compensation_mismatch",
    "market_conditions",
    "application_volume",
    "unclear_from_available_data",
  ]),
  explanation: z.string().min(1),
});

const diagnosisSchema = z.object({
  diagnosis: z.object({
    possibleReasons: z.array(reasonSchema).min(1).max(4),
    suggestedNextAction: z.string().min(1),
    confidenceNote: z.string().min(1),
  }),
});

function fallbackDiagnosis(): RejectionDiagnosisResult {
  return {
    possibleReasons: [
      {
        category: "unclear_from_available_data",
        explanation: "Automated diagnosis failed for this job; no grounded explanation is available right now.",
      },
    ],
    suggestedNextAction: "Try again later, or review the job's evaluation notes yourself for gaps.",
    confidenceNote: "This diagnosis could not be generated.",
  };
}

function daysSince(iso: string | null): string {
  if (!iso) return "Unknown";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  return `${days} day${days === 1 ? "" : "s"}`;
}

function buildJobText(job: RejectionIntelligenceJob): string {
  const dimensionLines = (job.evaluation ?? [])
    .map((d) => `- ${d.dimension}: ${d.grade} — ${d.note}`)
    .join("\n");

  return `Title: ${job.title ?? "Unknown"}
Company: ${job.company ?? "Unknown"}
Days since last status change: ${daysSince(job.application_status_updated_at)}
Missing skills (from this job's own evaluation): ${(job.missing_skills ?? []).join(", ") || "None recorded"}
Stored 10-dimension evaluation:
${dimensionLines || "No evaluation on record for this job."}
Job description excerpt: ${(job.description ?? "").slice(0, 1500) || "Not available"}`;
}

export const SYSTEM_PROMPT = `You are helping a candidate understand why an employer likely went silent after they applied. Be direct and honest, never comforting filler.

The single hardest constraint: you have NO real information from the employer about why they didn't respond — there is no feedback loop. You are only allowed to reason from the job's own already-stored evaluation data (the 10-dimension grades/notes, missing skills, and job description excerpt given to you). Never invent a generic reason like "the market is tough right now" or "they probably had many applicants" unless something in the supplied data actually supports it.

Rules:
- Every possible reason must cite something specific from the supplied evaluation data (a named dimension grade, a specific missing skill, a specific note) — if you can't point to supporting data for a reason, don't include it.
- Return 1-4 possible reasons, ordered most-likely first based on the weakest graded dimensions and any missing skills.
- "market_conditions" or "application_volume" categories may ONLY be used if no dimension in the evaluation is graded C or below — i.e. only when the candidate's own stored fit data gives no other explanation. Never use these as a default filler reason.
- "unclear_from_available_data" is the honest fallback when the evaluation data doesn't clearly point anywhere — use it rather than fabricating a reason to fill the list.
- suggestedNextAction: one concrete, specific next step (e.g. "add a project demonstrating X to your profile before your next application in this space"), not generic advice like "keep trying."
- confidenceNote: always explicitly state that this is a plausible-explanation exercise grounded in the job's own data, not a real answer from the employer.

Return ONLY valid JSON matching this exact shape:
{
  "diagnosis": {
    "possibleReasons": [
      { "category": "skills_gap"|"seniority_mismatch"|"compensation_mismatch"|"market_conditions"|"application_volume"|"unclear_from_available_data", "explanation": "string, cites specific supplied data" }
    ],
    "suggestedNextAction": "string",
    "confidenceNote": "string"
  }
}`;

export async function diagnoseRejectionForJob(
  job: RejectionIntelligenceJob,
  provider: ModelProvider = "gemini",
): Promise<RejectionDiagnosisResult> {
  const userPrompt = `JOB TO DIAGNOSE:\n${buildJobText(job)}`;

  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
    maxTokens: 2000,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/rejectionIntelligence] JSON parse failed", error);
    return fallbackDiagnosis();
  }

  const result = diagnosisSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/rejectionIntelligence] schema validation failed", result.error);
    return fallbackDiagnosis();
  }

  return result.data.diagnosis;
}
