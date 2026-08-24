import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";

// Job-description decoder (build-plan.md §B) — classifies a job's own
// already-extracted Required requirements into genuine must-haves vs likely
// boilerplate/padding (generic phrases like "excellent communication
// skills" or an inflated years-of-experience bar that shows up on nearly
// every posting regardless of actual need). Reads only this job's own
// already-stored requirements/niceToHave lists — no new external lookup,
// same "reasoning over existing data" shape as Trap Door Predictor.

export type RequirementClassification = "must_have" | "likely_padding";

export type DecodedRequirement = {
  text: string;
  classification: RequirementClassification;
  reasoning: string; // one short honest sentence, never a fabricated statistic
};

export type JobDecoderResult = {
  requirements: DecodedRequirement[];
};

const decodedSchema = z.object({
  text: z.string().min(1),
  classification: z.enum(["must_have", "likely_padding"]),
  reasoning: z.string().min(1),
});

const resultSchema = z.object({
  requirements: z.array(decodedSchema).min(1),
});

function fallbackResult(requirements: string[]): JobDecoderResult {
  return {
    requirements: requirements.map((text) => ({
      text,
      classification: "must_have",
      reasoning: "Automated decoding failed for this item — treated as a must-have by default.",
    })),
  };
}

const SYSTEM_PROMPT = `You are helping a job candidate figure out which of a job posting's own listed "Required" qualifications are genuine must-haves versus generic boilerplate/padding that gets copy-pasted into nearly every posting regardless of real need.

Rules:
- Classify each requirement given as either "must_have" (a specific, concrete, role-critical qualification an employer would actually screen hard on — a specific technology, a specific certification, a hard years-of-experience floor for a senior/specialized role) or "likely_padding" (generic soft-skill phrases like "excellent communication skills," "team player," "detail-oriented," or an inflated years-of-experience number that's disproportionate to the actual role level).
- Every reasoning line must be a short, honest, one-sentence explanation — never invent a statistic about hiring rates or claim to know the employer's actual screening process. Frame it as a pattern-based read, not a certainty.
- This is meant to help a candidate decide where to focus their application, not to encourage skipping real requirements — be conservative: if genuinely unsure, classify as must_have.
- Return one output entry per input requirement, in the same order, using the requirement's own exact text.

Return ONLY valid JSON matching this exact shape:
{
  "requirements": [
    { "text": "string, exact input text", "classification": "must_have"|"likely_padding", "reasoning": "string" }
  ]
}`;

export async function decodeJobRequirements(
  jobTitle: string | null,
  requirements: string[],
  provider: ModelProvider = "gemini",
): Promise<JobDecoderResult> {
  if (requirements.length === 0) {
    return { requirements: [] };
  }

  const userPrompt = `Job title: ${jobTitle ?? "Unknown"}
Required qualifications listed on this posting:
${requirements.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;

  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
    maxTokens: 1500,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/jobDecoder] JSON parse failed", error);
    return fallbackResult(requirements);
  }

  const result = resultSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/jobDecoder] schema validation failed", result.error);
    return fallbackResult(requirements);
  }

  return result.data;
}
