import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import type { InterviewQuestion } from "@/lib/interviewQuestions";

// Matches the candidate's own real STAR stories against a target company/
// role's Question Bank — ephemeral (not persisted to DB), a function of the
// user's current mutable story set x a chosen role, not worth a staleness-
// tracking cache table. Same honesty idiom as the rest of this batch: never
// invent a story, only ever pick from what was actually supplied.

export type StarStoryForMatching = { id: string; title: string; situation: string; task: string; action: string; result: string };

export type StoryMatch = {
  questionText: string;
  category: string;
  matchedStoryId: string | null;
  matchedStoryTitle: string | null;
  rationale: string;
};

export type StarMatchResult = {
  matches: StoryMatch[];
  gapSummary: string[]; // competencies with no matching story
};

const matchSchema = z.object({
  starMatch: z.object({
    matches: z
      .array(
        z.object({
          questionText: z.string().min(1),
          category: z.string().min(1),
          matchedStoryId: z.string().nullable(),
          matchedStoryTitle: z.string().nullable(),
          rationale: z.string().min(1),
        }),
      )
      .min(1),
    gapSummary: z.array(z.string()).max(5),
  }),
});

function fallbackResult(questions: InterviewQuestion[]): StarMatchResult {
  return {
    matches: questions.map((q) => ({
      questionText: q.question,
      category: q.category,
      matchedStoryId: null,
      matchedStoryTitle: null,
      rationale: "Matching could not be generated right now.",
    })),
    gapSummary: ["This match could not be generated — try again shortly."],
  };
}

export const STAR_MATCH_SYSTEM_PROMPT = `You are helping a candidate figure out which of their own real STAR stories best answers each predicted interview question.

Hard constraints:
- Only ever pick from the stories actually supplied — match by id. Never invent a story or describe one that wasn't given to you.
- Only match behavioral/culture_fit questions to a story (technical/system_design questions should get matchedStoryId: null, rationale: "Not a story-based question").
- A story only counts as a match if it genuinely demonstrates the competency the question is probing — don't force a weak match just to fill every question. If nothing fits, set matchedStoryId to null and explain what's missing in the rationale.
- gapSummary: list up to 5 short competency phrases (e.g. "conflict resolution", "ambiguous requirements", "leading without authority") that came up in the behavioral/culture_fit questions but have no matching story at all.

Return ONLY valid JSON matching this exact shape:
{
  "starMatch": {
    "matches": [
      { "questionText": "string", "category": "string", "matchedStoryId": "string or null", "matchedStoryTitle": "string or null", "rationale": "string" }
    ],
    "gapSummary": ["string"]
  }
}`;

export async function matchStoriesToQuestions(
  stories: StarStoryForMatching[],
  questions: InterviewQuestion[],
  provider: ModelProvider = "gemini",
): Promise<StarMatchResult> {
  const storiesText = stories
    .map((s) => `- id: ${s.id}\n  title: ${s.title}\n  situation: ${s.situation}\n  task: ${s.task}\n  action: ${s.action}\n  result: ${s.result}`)
    .join("\n");
  const questionsText = questions.map((q) => `- [${q.category}] ${q.question}`).join("\n");

  const userPrompt = `CANDIDATE'S STORIES:\n${storiesText}\n\nQUESTIONS TO MATCH:\n${questionsText}`;

  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt: STAR_MATCH_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.2,
    maxTokens: 2500,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/starStoryMatcher] JSON parse failed", error);
    return fallbackResult(questions);
  }

  const result = matchSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/starStoryMatcher] schema validation failed", result.error);
    return fallbackResult(questions);
  }

  return result.data.starMatch;
}
