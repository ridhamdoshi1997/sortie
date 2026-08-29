import { z } from "zod";

import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";
import type { CompanyResearchDossier } from "@/types";

// Distinct from CompanyResearchDossier.interviewPrep (generic prep talking
// points, already rendered in CompanyResearch.tsx) — this predicts
// specifically tough/uncomfortable questions, grounded only in real risk
// signals already sitting in this job's own stored research (culture notes,
// strategic_moat existential threats, a detected title-vs-responsibilities
// mismatch). Same honesty idiom as lib/rejectionIntelligence.ts: cite
// specific supplied data, never invent a real reported incident, and if
// nothing risky is present, fall back to grounded-but-generic prep
// questions rather than fabricating risk.

export type TrapDoorPredictionCategory =
  | "instability_signal"
  | "demanding_culture"
  | "scope_ambiguity"
  | "strategy_shift"
  | "unclear_from_available_data";

export const TRAP_DOOR_CATEGORY_LABELS: Record<TrapDoorPredictionCategory, string> = {
  instability_signal: "Instability signal",
  demanding_culture: "Demanding culture",
  scope_ambiguity: "Scope ambiguity",
  strategy_shift: "Strategy shift",
  unclear_from_available_data: "General prep",
};

export type TrapDoorPrediction = {
  question: string;
  category: TrapDoorPredictionCategory;
  whyLikely: string; // cites specific supplied data
};

export type TrapDoorPredictionResult = {
  predictions: TrapDoorPrediction[];
  confidenceNote: string;
};

export type TrapDoorJob = {
  id: string;
  title: string | null;
  company: string | null;
  companyResearch: CompanyResearchDossier | null;
  strategicMoat: { strategicPriorities: string[]; existentialThreats: string[] } | null;
  titleScopeMismatch: { flagged: boolean; note: string } | null;
};

const predictionSchema = z.object({
  question: z.string().min(1),
  category: z.enum([
    "instability_signal",
    "demanding_culture",
    "scope_ambiguity",
    "strategy_shift",
    "unclear_from_available_data",
  ]),
  whyLikely: z.string().min(1),
});

const resultSchema = z.object({
  trapDoors: z.object({
    predictions: z.array(predictionSchema).min(1).max(4),
    confidenceNote: z.string().min(1),
  }),
});

function fallbackResult(): TrapDoorPredictionResult {
  return {
    predictions: [
      {
        question: "Could not generate a prediction right now — try again shortly.",
        category: "unclear_from_available_data",
        whyLikely: "Generation failed.",
      },
    ],
    confidenceNote: "This prediction could not be generated.",
  };
}

function buildJobText(job: TrapDoorJob): string {
  const research = job.companyResearch;
  const moat = job.strategicMoat;

  return `Title: ${job.title ?? "Unknown"}
Company: ${job.company ?? "Unknown"}
Culture notes (from company research): ${(research?.culture ?? []).join("; ") || "None recorded"}
Gaps to address (from company research): ${(research?.gapsToAddress ?? []).join("; ") || "None recorded"}
Recent updates (from company research): ${(research?.recentUpdates ?? []).join("; ") || "None recorded"}
Existential threats (from strategic moat briefing): ${(moat?.existentialThreats ?? []).join("; ") || "Not researched yet"}
Strategic priorities (from strategic moat briefing): ${(moat?.strategicPriorities ?? []).join("; ") || "Not researched yet"}
Title-vs-responsibilities mismatch flagged: ${job.titleScopeMismatch?.flagged ? `Yes — ${job.titleScopeMismatch.note}` : "No"}`;
}

export const TRAP_DOOR_SYSTEM_PROMPT = `You are helping a candidate prepare for tough, uncomfortable questions they might face in an interview at a specific company for a specific role.

The single hardest constraint: you have NO access to real leaked or reported interview questions. You are only allowed to reason from the job's own already-stored research (culture notes, gaps, recent updates, strategic threats/priorities, and any detected title-vs-responsibilities mismatch). Never invent a real reported incident (e.g. a specific named layoff event, lawsuit, or scandal) that isn't already present in the supplied data.

Rules:
- Every prediction must cite something specific from the supplied data (a named culture note, a named existential threat, the scope-mismatch flag) — if you can't point to supporting data, don't include a risk-framed prediction.
- If the supplied data contains real risk signals (existential threats, a flagged scope mismatch, a "demanding"/"fast-paced"/"high-pressure" culture note), predict pointed questions the candidate should be ready to field about them — e.g. a company with a named existential threat gets a "why join now, given X" question; a flagged scope mismatch gets a "this role's day-to-day looks broader than the title suggests — how do you feel about that" question.
- If the supplied data contains no real risk signals at all, return 2-3 grounded-but-generic prep questions instead (e.g. about the strongest strategic priority) — never fabricate risk to fill the list.
- Return 2-4 predictions.
- confidenceNote: always explicitly state this is a speculative prediction, not sourced from a real leaked interview.

Return ONLY valid JSON matching this exact shape:
{
  "trapDoors": {
    "predictions": [
      { "question": "string", "category": "instability_signal"|"demanding_culture"|"scope_ambiguity"|"strategy_shift"|"unclear_from_available_data", "whyLikely": "string, cites specific supplied data" }
    ],
    "confidenceNote": "string"
  }
}`;

export async function predictTrapDoorQuestions(
  job: TrapDoorJob,
  provider: ModelProvider = "gemini",
  tier: ModelTier = "smart",
): Promise<TrapDoorPredictionResult> {
  const userPrompt = `JOB TO PREPARE FOR:\n${buildJobText(job)}`;

  const raw = await complete(await getModel(provider, tier), {
    systemPrompt: TRAP_DOOR_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
    maxTokens: 1500,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/trapDoorPredictor] JSON parse failed", error);
    return fallbackResult();
  }

  const result = resultSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/trapDoorPredictor] schema validation failed", result.error);
    return fallbackResult();
  }

  return result.data.trapDoors;
}
