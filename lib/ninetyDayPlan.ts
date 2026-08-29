import { z } from "zod";

import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";

// First-90-days success plan (build-plan.md §F). Same "real data in,
// honest AI synthesis out" discipline as every other offer-stage feature —
// grounded only in this job's own real responsibilities/requirements and
// the candidate's own real missing-skills from this job's evaluation.
// Never invents company-specific onboarding process details not present in
// the job posting or company research.
export type NinetyDayPlan = {
  day30: string[];
  day60: string[];
  day90: string[];
  watchOuts: string[]; // grounded in real missing_skills / trap door signals
};

const planSchema = z.object({
  plan: z.object({
    day30: z.array(z.string().min(1)).min(2).max(4),
    day60: z.array(z.string().min(1)).min(2).max(4),
    day90: z.array(z.string().min(1)).min(2).max(4),
    watchOuts: z.array(z.string().min(1)).min(1).max(3),
  }),
});

function fallbackPlan(): NinetyDayPlan {
  return {
    day30: ["Automated plan generation failed for this job."],
    day60: ["Try again later."],
    day90: [],
    watchOuts: [],
  };
}

const SYSTEM_PROMPT = `You are drafting a first-90-days success plan for a candidate who just accepted this job offer, to help them ramp up deliberately instead of drifting through onboarding.

Rules:
- Ground every goal in the job's own real responsibilities/requirements — never invent a company-specific onboarding process, tool, or team structure not stated in the posting or research given.
- day30 should focus on learning/listening/relationship-building — not big deliverables yet.
- day60 should focus on early contributions building on what was learned in the first 30 days.
- day90 should focus on a first real, visible win or established rhythm.
- watchOuts: 1-3 honest risks to actively manage, grounded in the candidate's own real missing skills for this role (if given) or genuine role-scope signals from the posting — never generic "communicate well" advice.
- Every item should be a concrete, specific action, not vague advice like "learn the codebase."

Return ONLY valid JSON:
{
  "plan": {
    "day30": ["string"],
    "day60": ["string"],
    "day90": ["string"],
    "watchOuts": ["string"]
  }
}`;

type PlanInput = {
  jobTitle: string | null;
  company: string | null;
  responsibilities: string[];
  requirements: string[];
  missingSkills: string[];
};

export async function generateNinetyDayPlan(input: PlanInput, provider: ModelProvider = "gemini", tier: ModelTier = "smart"): Promise<NinetyDayPlan> {
  const userPrompt = `Job: ${input.jobTitle ?? "Unknown"} at ${input.company ?? "Unknown"}
Real responsibilities: ${input.responsibilities.join("; ") || "not recorded"}
Real requirements: ${input.requirements.join("; ") || "not recorded"}
Candidate's own missing skills for this role (per this job's evaluation): ${input.missingSkills.join(", ") || "none recorded"}`;

  const raw = await complete(await getModel(provider, tier), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.4,
    maxTokens: 1200,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/ninetyDayPlan] JSON parse failed", error);
    return fallbackPlan();
  }

  const result = planSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/ninetyDayPlan] schema validation failed", result.error);
    return fallbackPlan();
  }

  return result.data.plan;
}
