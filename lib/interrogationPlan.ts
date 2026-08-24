import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import type { InterviewerBackground } from "@/agent/research";

// Pure synthesis over two already-shipped, already-stored sources — no new
// external research call of its own. Same honesty idiom as
// lib/leverageSynthesizer.ts: never invent a fact about a named person
// beyond what's already in their researched_background, and every general
// question must trace back to a specific strategic_moat entry.

export type InterrogationPlanResult = {
  generalQuestions: string[];
  perInterviewer: { name: string; questions: string[]; rationale: string }[];
};

export type InterrogationPlanInput = {
  strategicMoat: {
    strategicPriorities: string[];
    existentialThreats: string[];
    smartQuestions: string[];
  } | null;
  panelMembers: { name: string; background: InterviewerBackground }[];
};

const planSchema = z.object({
  interrogationPlan: z.object({
    generalQuestions: z.array(z.string().min(1)).min(0).max(5),
    perInterviewer: z
      .array(
        z.object({
          name: z.string().min(1),
          questions: z.array(z.string().min(1)).min(1).max(3),
          rationale: z.string().min(1),
        }),
      )
      .min(0),
  }),
});

function fallbackResult(panelMembers: InterrogationPlanInput["panelMembers"]): InterrogationPlanResult {
  return {
    generalQuestions: ["This plan could not be generated right now — try again shortly."],
    perInterviewer: panelMembers.map((m) => ({
      name: m.name,
      questions: [],
      rationale: "Generation failed.",
    })),
  };
}

function buildInputText(input: InterrogationPlanInput): string {
  const moat = input.strategicMoat;
  const moatText = moat
    ? `Strategic priorities: ${moat.strategicPriorities.join("; ") || "None recorded"}
Existential threats: ${moat.existentialThreats.join("; ") || "None recorded"}
Already-surfaced smart questions: ${moat.smartQuestions.join("; ") || "None recorded"}`
    : "No strategic moat briefing generated yet.";

  const panelText = input.panelMembers.length
    ? input.panelMembers
        .map(
          (m) =>
            `- ${m.name}: ${m.background.summary} Prior companies: ${m.background.priorCompanies.join(", ") || "Unknown"}. Prep note: ${m.background.interviewPrepNote}`,
        )
        .join("\n")
    : "No researched panelists yet.";

  return `COMPANY STRATEGIC CONTEXT:\n${moatText}\n\nINTERVIEW PANEL (researched backgrounds only):\n${panelText}`;
}

export const INTERROGATION_PLAN_SYSTEM_PROMPT = `You are helping a candidate build a script of smart questions to ask THEIR interviewers at the end of an interview.

Hard constraints:
- generalQuestions must each trace back to a specific supplied strategic priority or existential threat — never generic filler like "what's the culture like."
- perInterviewer questions must be grounded ONLY in that specific person's supplied background (prior companies, summary, prep note) — never invent a fact about them not present in the supplied data. If a supplied panelist has no useful background info, exclude them from perInterviewer rather than inventing something.
- Every perInterviewer entry needs a short rationale explaining why that question is a good fit for that specific person.
- Return 2-5 generalQuestions (0 only if truly no strategic context was supplied) and one perInterviewer entry per panelist with usable background (1-3 questions each).

Return ONLY valid JSON matching this exact shape:
{
  "interrogationPlan": {
    "generalQuestions": ["string"],
    "perInterviewer": [
      { "name": "string", "questions": ["string"], "rationale": "string" }
    ]
  }
}`;

export async function synthesizeInterrogationPlan(
  input: InterrogationPlanInput,
  provider: ModelProvider = "gemini",
): Promise<InterrogationPlanResult> {
  const userPrompt = buildInputText(input);

  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt: INTERROGATION_PLAN_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.3,
    maxTokens: 1500,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/interrogationPlan] JSON parse failed", error);
    return fallbackResult(input.panelMembers);
  }

  const result = planSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/interrogationPlan] schema validation failed", result.error);
    return fallbackResult(input.panelMembers);
  }

  return result.data.interrogationPlan;
}
