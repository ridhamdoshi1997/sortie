import { z } from "zod";

import { complete, getModel } from "@/lib/models";
import { HUMANIZED_WRITING_RULES } from "@/lib/writingStyle";

// Cached AI Question Bank (build-plan.md §N, Phase 1) — genuinely legal/free
// sources for real company interview questions don't exist at scale
// (Reddit/LeetCode/Blind ban scraping or commercial AI use, Glassdoor/Indeed
// sit behind a login wall). The honest answer, per 2 agy research passes: AI
// generation, cached and reused, clearly labeled as predicted rather than
// sourced from real interviews. Keyed on (company, role_family, seniority),
// NOT per-job or per-user — the same generated bank is shared across every
// user/posting matching that combination, same "generate once, persist,
// reuse" shape as company research dossiers, just shared instead of
// per-job-scoped.

export type QuestionCategory = "behavioral" | "technical" | "system_design" | "culture_fit";

export type InterviewQuestion = {
  question: string;
  category: QuestionCategory;
  rationale: string;
  tags?: string[];
  // Deep per-question study content — deliberately absent until the user
  // expands a question (lazy, not generated with the rest of the bank).
  // Addressed by array index (see getQuestionDetails in
  // actions/interviewQuestions.ts), not a stable id — the array order never
  // changes after generation, and indexing avoids needing to backfill an id
  // onto every already-cached bank row in production. undefined = never
  // fetched, null = fetched but generation failed.
  details?: QuestionDetails | null;
};

// Discriminated by question type, not QuestionCategory 1:1 — "technical" and
// "system_design" both get a code/approach-shaped answer (system_design
// swaps a runnable solution for a prose design walkthrough, since forcing
// code onto a design question would be dishonest), "behavioral" and
// "culture_fit" both get a STAR-framework-shaped answer. Per agy research
// (2026-08-14): don't force JobRight's exact shape (they're human-fed, we're
// not) — this is what an LLM can honestly produce zero-shot without a human
// review step, labeled as coaching/reference material, never "verified" or
// implying a real leaked answer key.
export type TechnicalQuestionDetails = {
  type: "technical";
  insiderTips: { whatTheyTest: string; commonPitfall: string; edgeCases: string[] };
  approachSteps: string[];
  solution: { language: string; code: string; timeComplexity: string; spaceComplexity: string };
};

export type SystemDesignQuestionDetails = {
  type: "system_design";
  insiderTips: { whatTheyTest: string; commonPitfall: string };
  approachSteps: string[];
  solutionOutline: string; // prose design walkthrough, not runnable code
};

export type BehavioralQuestionDetails = {
  type: "behavioral" | "culture_fit";
  insiderTips: { whatTheyLookFor: string; redFlags: string[] };
  starFramework: { situationPrompt: string; actionStrategies: string[]; impactMetrics: string[] };
};

export type QuestionDetails =
  | TechnicalQuestionDetails
  | SystemDesignQuestionDetails
  | BehavioralQuestionDetails;

const questionDetailsSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("technical"),
    insiderTips: z.object({
      whatTheyTest: z.string().min(1),
      commonPitfall: z.string().min(1),
      edgeCases: z.array(z.string()).max(3),
    }),
    approachSteps: z.array(z.string().min(1)).min(1),
    solution: z.object({
      language: z.string().min(1),
      code: z.string().min(1),
      timeComplexity: z.string().min(1),
      spaceComplexity: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("system_design"),
    insiderTips: z.object({
      whatTheyTest: z.string().min(1),
      commonPitfall: z.string().min(1),
    }),
    approachSteps: z.array(z.string().min(1)).min(1),
    solutionOutline: z.string().min(1),
  }),
  z.object({
    type: z.enum(["behavioral", "culture_fit"]),
    insiderTips: z.object({
      whatTheyLookFor: z.string().min(1),
      redFlags: z.array(z.string()).max(2),
    }),
    starFramework: z.object({
      situationPrompt: z.string().min(1),
      actionStrategies: z.array(z.string().min(1)).min(1),
      impactMetrics: z.array(z.string().min(1)).min(1),
    }),
  }),
]);

const questionDetailsResultSchema = z.object({ details: questionDetailsSchema });

export type QuestionBank = {
  id: string;
  company: string;
  roleFamily: string;
  seniority: string;
  questions: InterviewQuestion[];
  generatedAt: string;
};

// Strips seniority/level words so "Senior Software Engineer" and "Staff
// Software Engineer" collapse to the same role_family ("Software Engineer")
// — seniority is tracked as its own cache-key dimension, not duplicated
// inside the title. A coarse heuristic, not a full taxonomy classifier:
// good enough for cache reuse, not meant to be a perfect normalization.
const SENIORITY_WORDS =
  /\b(intern|entry[- ]?level|junior|jr\.?|associate|mid[- ]?level|senior|sr\.?|staff|principal|lead|head|director|vp|chief|i{1,3}|iv|v)\b/gi;

export function normalizeRoleFamily(title: string): string {
  return title
    .replace(SENIORITY_WORDS, "")
    .replace(/\s+/g, " ")
    .trim() || title.trim();
}

export function buildCacheKey(company: string, roleFamily: string, seniority: string): string {
  return [company, roleFamily, seniority || "unspecified"]
    .map((part) => part.trim().toLowerCase())
    .join("::");
}

export async function generateQuestionBank(
  company: string,
  roleFamily: string,
  seniority: string,
): Promise<InterviewQuestion[]> {
  const raw = await complete(getModel("gemini", "smart"), {
    systemPrompt: `You are helping a job candidate prepare for an interview by predicting likely interview questions. You have no access to real leaked or sourced interview questions from this specific company — you are generating REALISTIC, PLAUSIBLE questions based on the company's known industry, business model, tech stack reputation, and typical expectations for this role and seniority level. Never imply these are real questions someone was actually asked. Generate 10-15 questions across a mix of categories: behavioral, technical, system_design (only if the role is technical and seniority warrants it), and culture_fit. Each question needs a one-sentence rationale explaining why a company like this, for a role like this, would likely ask it.

${HUMANIZED_WRITING_RULES}

Return only valid JSON.`,
    userPrompt: `Company: ${company}
Role family: ${roleFamily}
Seniority: ${seniority || "not specified"}

Return JSON matching this exact shape:
{
  "questions": [
    { "question": "string", "category": "behavioral" | "technical" | "system_design" | "culture_fit", "rationale": "string" }
  ]
}`,
    temperature: 0.7,
    maxTokens: 3000,
    jsonResponse: true,
  });

  const parsed = JSON.parse(raw) as { questions: InterviewQuestion[] };
  return parsed.questions;
}

// Lazy, per-question deep content — generated only when a user actually
// expands a question (see actions/interviewQuestions.ts's getQuestionDetails),
// never eagerly with the rest of the bank. Per agy research (2026-08-14):
// bundling this into the bulk generation call bloats the prompt, slows the
// initial fetch, and degrades quality toward the end of a long list — a
// second small focused call per question is both cheaper in practice (most
// users only expand a handful of questions) and higher quality.
export async function generateQuestionDetails(
  question: InterviewQuestion,
  company: string,
  roleFamily: string,
  seniority: string,
): Promise<QuestionDetails> {
  const isCoding = question.category === "technical";
  const isSystemDesign = question.category === "system_design";

  const shapeInstruction = isCoding
    ? `Return JSON matching this exact shape:
{
  "details": {
    "type": "technical",
    "insiderTips": { "whatTheyTest": "string", "commonPitfall": "string", "edgeCases": ["string", ...] },
    "approachSteps": ["string", ...],
    "solution": { "language": "string", "code": "string", "timeComplexity": "string", "spaceComplexity": "string" }
  }
}`
    : isSystemDesign
      ? `Return JSON matching this exact shape:
{
  "details": {
    "type": "system_design",
    "insiderTips": { "whatTheyTest": "string", "commonPitfall": "string" },
    "approachSteps": ["string", ...],
    "solutionOutline": "string, a prose design walkthrough — no code"
  }
}`
      : `Return JSON matching this exact shape:
{
  "details": {
    "type": "${question.category}",
    "insiderTips": { "whatTheyLookFor": "string", "redFlags": ["string", ...] },
    "starFramework": { "situationPrompt": "string", "actionStrategies": ["string", ...], "impactMetrics": ["string", ...] }
  }
}`;

  const raw = await complete(getModel("gemini", "smart"), {
    systemPrompt: `You are an interview coach producing deep study material for ONE specific predicted interview question. You have no access to a real leaked answer key — everything you produce is a synthesized reference based on common industry patterns for this role, and must read that way, never as a claim of "verified" or "the real answer."

${
  isCoding
    ? `This is a technical/coding question. Produce: what the question is really testing beneath the surface, the single most common mistake candidates make, up to 3 edge cases worth calling out, a 3-5 step approach, and a working reference solution in a sensible language for this role with its time/space complexity.`
    : isSystemDesign
      ? `This is a system design question. Produce: what it's really testing, the most common pitfall, a 3-5 step approach, and a prose solution outline (architecture/tradeoffs walkthrough) — do NOT include runnable code, this is a design discussion, not an implementation exercise.`
      : `This is a behavioral/culture-fit question. Do NOT write a canned "model answer" — instead give the candidate a STAR framework to build their OWN real answer from: what the interviewer is actually looking for, up to 2 red-flag response patterns to avoid, a situation-picking prompt, 2-4 action strategies to make sure they highlight, and 2-3 concrete ways to quantify their impact.`
}

${HUMANIZED_WRITING_RULES}

${shapeInstruction}

Return only valid JSON.`,
    userPrompt: `Company: ${company}
Role family: ${roleFamily}
Seniority: ${seniority || "not specified"}
Question: ${question.question}
Why this is likely asked: ${question.rationale}`,
    temperature: 0.4,
    maxTokens: 1800,
    jsonResponse: true,
  });

  const parsed = JSON.parse(raw);
  const result = questionDetailsResultSchema.parse(parsed);
  return result.details;
}
