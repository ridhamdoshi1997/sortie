import { z } from "zod";

import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";

// "Market Readiness" — the free pivot of build-plan.md §E's "Passive
// market-watch," per agy's own suggested rescope: real ongoing job
// ingestion for a not-currently-searching user is a genuinely different
// (expensive) pipeline than this app's active-search flow. This version
// uses ONLY data already on hand — the user's own logged accomplishments
// and stated target roles — no new job data, no external lookup, same
// zero-marginal-cost shape as lib/outcomeNarrative.ts/lib/bragDoc.ts.

export type MarketReadinessResult = {
  observations: string[]; // 1-2 sentences, each grounded in the supplied accomplishments/tags
};

const marketReadinessSchema = z.object({
  observations: z.array(z.string().min(1)).min(1).max(2),
});

function fallbackResult(): MarketReadinessResult {
  return {
    observations: ["Automated analysis failed — try again in a moment."],
  };
}

export type AccomplishmentLite = { title: string; description: string | null; date: string; tags: string[] };

function buildAccomplishmentsText(accomplishments: AccomplishmentLite[]): string {
  return accomplishments
    .map((a) => `- [${a.date}] ${a.title}${a.tags.length > 0 ? ` (tags: ${a.tags.join(", ")})` : ""}`)
    .join("\n");
}

export const SYSTEM_PROMPT = `You are looking at a job candidate's OWN logged career accomplishments (their private record, not a public résumé) and their own stated target job titles. Surface an observation about how their recent work compares to what they say they're aiming for — nothing more.

Rules:
- 1-2 observations only, each grounded in specific accomplishment titles, tags, or dates actually supplied — never a vague generality like "you've been productive."
- If their recent accomplishments skew toward a different skill area or role shape than their stated target titles, say so plainly and ask if it's intentional (e.g. "your last 6 months skew toward data infrastructure work, not the frontend roles you've listed as targets — intentional, or worth updating your target titles?"). If there's no real target-role mismatch to point out, surface the next most useful pattern instead (a skill area recurring often, a gap in a stated target skill).
- Never invent a market benchmark, industry trend, or comparison to "most candidates" — you only have this one person's own logged data and their own stated targets.
- Never fabricate a statistic that isn't directly countable from the supplied list.
- Plain, direct language. No filler, no encouragement-for-its-own-sake.

Return ONLY valid JSON matching this exact shape:
{ "observations": ["string", "string"] }`;

export async function generateMarketReadinessNarrative(
  accomplishments: AccomplishmentLite[],
  targetTitles: string[],
  provider: ModelProvider = "gemini",
  tier: ModelTier = "smart",
): Promise<MarketReadinessResult> {
  const userPrompt = `THE CANDIDATE'S OWN LOGGED ACCOMPLISHMENTS (most recent first):
${buildAccomplishmentsText(accomplishments) || "None logged yet."}

THE CANDIDATE'S OWN STATED TARGET JOB TITLES:
${targetTitles.length > 0 ? targetTitles.join(", ") : "None specified."}`;

  const raw = await complete(await getModel(provider, tier), {
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
    console.error("[lib/marketReadiness] JSON parse failed", error);
    return fallbackResult();
  }

  const result = marketReadinessSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/marketReadiness] schema validation failed", result.error);
    return fallbackResult();
  }

  return result.data;
}
