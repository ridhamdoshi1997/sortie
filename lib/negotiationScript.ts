import { z } from "zod";

import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";
import type { LeverageSynthesisResult } from "@/lib/leverageSynthesizer";

// Negotiation scripts (build-plan.md §F, Phase 12). Deliberately does NOT
// re-derive leverage from job data — it converts the leverage synthesis
// that already exists (lib/leverageSynthesizer.ts) into actual spoken/
// written negotiation language. Same hard constraint as that module: no
// market-rate data exists here, so every line must stay grounded in the
// leverage synthesis's own already-derived factors/talking points, never
// invent a number or a "typical offer" claim.

export type NegotiationScript = {
  openingAsk: string; // what to say/write when first responding to the offer
  counterResponses: { theirPushback: string; yourResponse: string }[]; // 2-3 realistic pushback scenarios + how to respond
  closingLine: string; // how to wrap up gracefully regardless of outcome
};

const scriptSchema = z.object({
  script: z.object({
    openingAsk: z.string().min(1),
    counterResponses: z
      .array(z.object({ theirPushback: z.string().min(1), yourResponse: z.string().min(1) }))
      .min(1)
      .max(3),
    closingLine: z.string().min(1),
  }),
});

function fallbackScript(): NegotiationScript {
  return {
    openingAsk: "Automated script generation failed for this job — no grounded script is available right now.",
    counterResponses: [{ theirPushback: "N/A", yourResponse: "Try again later, or work from the leverage synthesis above yourself." }],
    closingLine: "This script could not be generated.",
  };
}

const SYSTEM_PROMPT = `You are turning an already-completed negotiation-leverage analysis into an actual, ready-to-use script a candidate can say or write when responding to a job offer.

You are given the leverage synthesis's own output (leverage level, cited factors, talking points) — you must NOT invent any new leverage reasoning, market-rate figures, or "typical offer" claims beyond what's already in that synthesis. Your only job is to turn already-grounded talking points into natural, confident, professional negotiation language.

Rules:
- openingAsk: a short, natural paragraph (3-5 sentences) the candidate could actually say on a call or write in an email to open the negotiation — grateful tone, references their genuine interest, then makes a specific ask grounded in the supplied talking points.
- counterResponses: 2-3 realistic ways an employer might push back (e.g. "that's outside our band," "we don't have room to move," "let me check with the team") paired with a natural, non-confrontational response for each — grounded only in the supplied leverage factors, never a new fabricated argument.
- closingLine: a short, graceful way to end the conversation regardless of outcome — preserves the relationship whether they say yes, no, or "let me get back to you."
- Match the tone to the leverage level given: confident but not pushy when leverage is strong, humble and appreciative when leverage is limited or unclear — never coach the candidate to overplay a weak hand.
- Keep every line natural and conversational — this should sound like a person talking, not a bulleted business memo.

Return ONLY valid JSON matching this exact shape:
{
  "script": {
    "openingAsk": "string",
    "counterResponses": [{ "theirPushback": "string", "yourResponse": "string" }],
    "closingLine": "string"
  }
}`;

export async function generateNegotiationScript(
  jobTitle: string | null,
  company: string | null,
  leverage: LeverageSynthesisResult,
  provider: ModelProvider = "gemini",
  tier: ModelTier = "smart",
): Promise<NegotiationScript> {
  const factorLines = leverage.factors.map((f) => `- ${f.label}: ${f.explanation}`).join("\n");
  const talkingPointLines = leverage.talkingPoints.map((t) => `- ${t}`).join("\n");

  const userPrompt = `Job: ${jobTitle ?? "Unknown"} at ${company ?? "Unknown"}
Leverage level: ${leverage.leverageLevel}
Cited factors:
${factorLines}
Talking points already derived:
${talkingPointLines}
Confidence note: ${leverage.confidenceNote}`;

  const raw = await complete(await getModel(provider, tier), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5,
    maxTokens: 1200,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/negotiationScript] JSON parse failed", error);
    return fallbackScript();
  }

  const result = scriptSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/negotiationScript] schema validation failed", result.error);
    return fallbackScript();
  }

  return result.data.script;
}
