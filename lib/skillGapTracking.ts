import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";

// Skill-gap tracking & career pathing (build-plan.md §E, "not yet scoped").
// Two parts: a plain, zero-AI aggregation of missing_skills already stored
// per-job (real counts, no invention), then one optional AI synthesis call
// turning the pattern into career-pathing advice — same "aggregate real
// data, one honest synthesis call" shape as lib/marketReadiness.ts.

export type SkillGap = { skill: string; count: number };

const MIN_JOBS_FOR_PATTERN = 5;

// Pure, no AI — counts how often each skill appears in missing_skills
// across the user's own evaluated jobs. Returns the top N, sorted by
// frequency.
export function aggregateSkillGaps(jobsMissingSkills: (string[] | null)[], topN = 5): SkillGap[] {
  const counts = new Map<string, number>();
  for (const skills of jobsMissingSkills) {
    for (const skill of skills ?? []) {
      counts.set(skill, (counts.get(skill) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);
}

export type SkillGapPathingResult = {
  observations: string[]; // 1-2 sentences, grounded only in the supplied real gap counts
};

const resultSchema = z.object({
  observations: z.array(z.string().min(1)).min(1).max(2),
});

function fallbackResult(): SkillGapPathingResult {
  return { observations: ["Automated analysis failed — try again in a moment."] };
}

const SYSTEM_PROMPT = `You are looking at a real, counted pattern of which skills keep showing up as "missing" across a candidate's own evaluated job postings — their own real search history, not a hypothetical.

Rules:
- 1-2 observations only, each grounded ONLY in the specific skills and counts given — never invent a skill, a market trend, or a claim about "most jobs" beyond this candidate's own counted data.
- Frame this as a real, honest pattern worth their attention, with a concrete, actionable next step (e.g. "consider a focused project or course in X" ) — not vague encouragement.
- If one skill clearly dominates, say so plainly. If the pattern is scattered/weak, say that honestly instead of forcing a conclusion.
- Never claim a skill is "in high industry demand" or similar — you only know it recurred in THIS candidate's own evaluated postings.

Return ONLY valid JSON: { "observations": ["string"] }`;

export async function generateSkillGapPathing(gaps: SkillGap[], provider: ModelProvider = "gemini"): Promise<SkillGapPathingResult> {
  const userPrompt = `Skills that recurred as "missing" across this candidate's own evaluated job postings, most frequent first:
${gaps.map((g) => `- ${g.skill}: appeared in ${g.count} postings`).join("\n")}`;

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
    console.error("[lib/skillGapTracking] JSON parse failed", error);
    return fallbackResult();
  }

  const result = resultSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/skillGapTracking] schema validation failed", result.error);
    return fallbackResult();
  }

  return result.data;
}

export { MIN_JOBS_FOR_PATTERN };
