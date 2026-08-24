import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import type { EvaluationDimensionResult } from "@/lib/evaluator";

// Post-Offer Leverage Synthesizer — same honesty-scoped shape as
// lib/rejectionIntelligence.ts (read that file's header comment first, this
// mirrors it deliberately). A candidate has no real visibility into why an
// employer is offering what they're offering, or how badly they want to
// close — there is no market-rate data source here. Every reason this module
// surfaces must cite something this app already knows about this specific
// job (its stored evaluation, how long it sat in the tracker, whether it
// kept reappearing in the user's own search history), never a fabricated
// "average signing bonus for this role" or "typical negotiation range"
// benchmark — those numbers don't exist here and inventing them would be
// worse than saying nothing.

export type LeverageLevel = "strong" | "moderate" | "limited" | "unclear";

export const LEVERAGE_LABELS: Record<LeverageLevel, string> = {
  strong: "Strong leverage",
  moderate: "Moderate leverage",
  limited: "Limited leverage",
  unclear: "Unclear from available data",
};

export type LeverageSynthesisResult = {
  leverageLevel: LeverageLevel;
  factors: {
    label: string; // short name for the signal, e.g. "High match score"
    explanation: string; // grounded in this job's actual stored data
  }[];
  talkingPoints: string[]; // 2-4 concrete negotiation angles, not generic advice
  confidenceNote: string; // always states this is reasoning from limited signal, not real market data
};

export type LeverageSynthesizerJob = {
  id: string;
  title: string | null;
  company: string | null;
  evaluation: EvaluationDimensionResult[] | null;
  missing_skills: string[] | null;
  match_score: number | null;
  title_scope_mismatch: { flagged: boolean; note: string } | null;
  found_at: string | null;
  application_status_updated_at: string | null;
  offerEntered: boolean; // whether the candidate has filled in offer_details — presence only, never the numbers compared to a market rate
  reappearanceLabel: string | null; // lib/churnSignal.ts's ReappearanceSignal.label, if any
};

const factorSchema = z.object({
  label: z.string().min(1),
  explanation: z.string().min(1),
});

const synthesisSchema = z.object({
  synthesis: z.object({
    leverageLevel: z.enum(["strong", "moderate", "limited", "unclear"]),
    factors: z.array(factorSchema).min(1).max(4),
    talkingPoints: z.array(z.string().min(1)).min(1).max(4),
    confidenceNote: z.string().min(1),
  }),
});

function fallbackSynthesis(): LeverageSynthesisResult {
  return {
    leverageLevel: "unclear",
    factors: [
      {
        label: "Synthesis failed",
        explanation: "Automated leverage synthesis failed for this job; no grounded read is available right now.",
      },
    ],
    talkingPoints: ["Try again later, or review this job's own evaluation and history yourself."],
    confidenceNote: "This synthesis could not be generated.",
  };
}

function daysSince(iso: string | null): string {
  if (!iso) return "Unknown";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
  return `${days} day${days === 1 ? "" : "s"}`;
}

function buildJobText(job: LeverageSynthesizerJob): string {
  const dimensionLines = (job.evaluation ?? [])
    .map((d) => `- ${d.dimension}: ${d.grade} — ${d.note}`)
    .join("\n");

  return `Title: ${job.title ?? "Unknown"}
Company: ${job.company ?? "Unknown"}
Match score: ${job.match_score ?? "Unknown"}
Days since this job was first found: ${daysSince(job.found_at)}
Days since it reached the Offer stage: ${daysSince(job.application_status_updated_at)}
Title/scope mismatch flagged: ${job.title_scope_mismatch?.flagged ? `Yes — ${job.title_scope_mismatch.note}` : "No"}
Reappearing-requisition signal: ${job.reappearanceLabel ?? "None recorded"}
Missing skills (from this job's own evaluation): ${(job.missing_skills ?? []).join(", ") || "None recorded"}
Candidate has entered their own offer numbers into the equity/comp calculator: ${job.offerEntered ? "Yes" : "No"}
Stored 10-dimension evaluation:
${dimensionLines || "No evaluation on record for this job."}`;
}

export const SYSTEM_PROMPT = `You are helping a candidate who has just received a job offer figure out how much real negotiating leverage they have, so they can decide how hard to push back.

The single hardest constraint: you have NO access to market salary data, no visibility into the employer's budget or how many other candidates they're considering, and no real benchmark for "typical" offers in this role or industry. You are only allowed to reason from the specific data already stored about THIS job and THIS candidate's history with it (match score, evaluation grades, missing skills, how long the job sat unfilled, how long it's sat at the Offer stage, whether it's a title/scope-mismatched posting, and whether it kept reappearing across the candidate's own search history — a possible signal the role is hard to fill).

Rules:
- Every factor must cite something specific from the supplied data — if you can't point to supporting data, don't include it.
- Never invent a market-rate claim ("typical offers for this role are $X-$Y", "candidates usually get N% more") — no such data was given to you, and none exists in this app. If a talking point would normally cite a market benchmark, ground it in this job's own data instead (fit, urgency signals, missing-skills gaps that don't matter much, a mismatched posting) or omit it.
- A long gap between the job first appearing and reaching the Offer stage is not proof of anything specific — reason about it honestly rather than assuming it always favors the candidate.
- leverageLevel should reflect the weight of evidence: "strong" only when multiple factors clearly favor the candidate (e.g. high match score AND a reappearance signal indicating the role is hard to fill), "limited" when evidence is thin or unfavorable, "unclear" when the stored data doesn't clearly support a reading either way.
- talkingPoints: 1-4 concrete, specific things the candidate could actually say or ask in a negotiation conversation, each grounded in a cited factor — not generic advice like "just ask for more."
- confidenceNote: always explicitly state this is a synthesis of this job's own stored signals, not real market or employer data, and should be one input among several the candidate uses.

Return ONLY valid JSON matching this exact shape:
{
  "synthesis": {
    "leverageLevel": "strong"|"moderate"|"limited"|"unclear",
    "factors": [
      { "label": "string, short name for the signal", "explanation": "string, cites specific supplied data" }
    ],
    "talkingPoints": ["string"],
    "confidenceNote": "string"
  }
}`;

export async function synthesizeLeverageForJob(
  job: LeverageSynthesizerJob,
  provider: ModelProvider = "gemini",
): Promise<LeverageSynthesisResult> {
  const userPrompt = `JOB TO ANALYZE:\n${buildJobText(job)}`;

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
    console.error("[lib/leverageSynthesizer] JSON parse failed", error);
    return fallbackSynthesis();
  }

  const result = synthesisSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/leverageSynthesizer] schema validation failed", result.error);
    return fallbackSynthesis();
  }

  return result.data.synthesis;
}
