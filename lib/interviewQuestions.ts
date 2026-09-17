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
  // Practice Sandbox (build-plan.md §N/§P, Tier 3) — same lazy-per-question
  // shape as `details` above, generated separately and only for technical
  // questions the user actually opens the sandbox for. Deliberately NOT
  // reusing `details.solution` (that field's language is whatever the AI
  // judged "sensible for the role" — often not JS/Python at all) since the
  // sandbox needs a language it can actually execute client-side.
  practiceKit?: PracticeKit | null;
};

// v1 scope, per the 2026-08-14 feasibility research: 100% client-side
// execution (lib/practiceSandbox.ts). Originally "soft verification" (run
// the same call against the user's code AND a real reference solution,
// show both outputs side by side, let the user judge) — reworked
// 2026-08-18 (agy critique) to strict pass/fail grading instead: the
// reference solution's own output becomes the graded ground truth at
// runtime, compared exactly against the candidate's output, no eyeballing
// required. Falls back to showing both outputs unlabeled only when the
// reference solution itself errors.
//
// Expanded 2026-08-18 from JS/Python to 5 languages (typescript/ruby/sql
// added) — each has a real, verified-live, genuinely-client-side execution
// engine (lib/practiceSandbox.ts). C#/Java were researched and deliberately
// excluded from client-side execution — Java's CheerpJ needs a paid
// commercial license past a 1-person company, C# has no genuine
// client-only live-compile path at all. Both are deferred pending a
// self-hosted Piston judge, not rejected outright.
//
// `functionName` is optional because SQL doesn't have one — its `code` is a
// schema-setup script (CREATE/INSERT), not a function definition, and its
// `testCases[].callExpression` is a SELECT query, not a function call. The
// contract still generalizes: `code` is "run first," `callExpression` is
// "run second, show its result" — true for every language here.
export type PracticeKit = {
  language: "javascript" | "typescript" | "python" | "ruby" | "sql";
  functionName?: string;
  starterCode: string;
  referenceSolution: string;
  testCases: { callExpression: string; description: string }[];
};

const practiceKitSchema = z.object({
  language: z.enum(["javascript", "typescript", "python", "ruby", "sql"]),
  functionName: z.string().min(1).optional(),
  starterCode: z.string().min(1),
  referenceSolution: z.string().min(1),
  testCases: z.array(z.object({ callExpression: z.string().min(1), description: z.string().min(1) })).min(1).max(3),
});

const practiceKitResultSchema = z.object({ practiceKit: practiceKitSchema });

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
      // .transform() truncates instead of .max() rejecting — the prompt
      // asks for "up to 3" but an LLM over-generating past that shouldn't
      // crash generation (real bug, Phase 15: an over-long redFlags array
      // below did exactly this, surfaced as a raw Zod error to the user).
      edgeCases: z.array(z.string()).transform((arr) => arr.slice(0, 3)),
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
      // Real bug, Phase 15: the AI sometimes returns more than 2 red flags
      // despite the prompt asking for "up to 2" — .max() rejected the whole
      // response with a raw Zod error surfaced straight to the user.
      // .transform() truncates instead of rejecting, so an over-generation
      // never crashes the request.
      redFlags: z.array(z.string()).transform((arr) => arr.slice(0, 2)),
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

// The role a company-level lookup uses when the candidate hasn't named one
// (2026-09-10, direct user instruction: clicking a company in the browse grid
// must return questions regardless of position, with role kept optional).
// A real value rather than an empty string on purpose: it's part of the cache
// key, so company-wide banks cache and dedupe like any other, and it's what
// the prompt below switches on to ask for broadly-applicable questions
// instead of role-specific ones.
export const ANY_ROLE = "Any role";

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
  // Company-wide mode: no role was given, so the questions must be ones this
  // employer would plausibly ask ANY candidate — its values, its business,
  // how it works — rather than guessing at a role nobody named.
  const anyRole = roleFamily === ANY_ROLE;
  // "fast" = the free GEMINI_API_KEY_FAST; "smart" is the billed key.
  // These banks feed PUBLIC interview-questions SEO pages, so every
  // anonymous visit that misses the cache was hitting the paid meter.
  const raw = await complete(await getModel("gemini", "fast"), {
    systemPrompt: `You are helping a job candidate prepare for an interview by predicting likely interview questions. You have no access to real leaked or sourced interview questions from this specific company — you are generating REALISTIC, PLAUSIBLE questions based on the company's known industry, business model, tech stack reputation, and typical expectations${anyRole ? "" : " for this role and seniority level"}. Never imply these are real questions someone was actually asked. ${
      anyRole
        ? "NO SPECIFIC ROLE was given, so generate questions this company would plausibly ask ANY candidate: its values and culture, its business and product, how it works, and broadly-applicable behavioral questions. Do not invent a role or assume the candidate is technical — skip system_design entirely and keep any technical question generic to the company's domain."
        : ""
    }Generate 10-15 questions across a mix of categories: behavioral, technical, system_design (only if the role is technical and seniority warrants it), and culture_fit. Each question needs a one-sentence rationale explaining why a company like this${anyRole ? "" : ", for a role like this,"} would likely ask it.

${HUMANIZED_WRITING_RULES}

Return only valid JSON.`,
    userPrompt: `Company: ${company}
Role family: ${anyRole ? "not specified — company-wide questions" : roleFamily}
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

  // "fast" = the free GEMINI_API_KEY_FAST; "smart" is the billed key.
  // These banks feed PUBLIC interview-questions SEO pages, so every
  // anonymous visit that misses the cache was hitting the paid meter.
  const raw = await complete(await getModel("gemini", "fast"), {
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

// Lazy, per-question — only generated when a user actually opens the
// Practice Sandbox for a technical question, same trigger shape as
// generateQuestionDetails above. Deliberately constrained to a single
// self-contained function with no imports/external calls (must run inside
// a plain Web Worker for JS, or Pyodide's stock library for Python — no
// network access, no filesystem) and to plain built-in data types the
// worker's JSON.stringify/str() can render as a readable string (numbers,
// strings, lists/arrays, dicts/objects, booleans) — no custom classes, no
// generators, nothing that would produce an unreadable [object Object] in
// the side-by-side output comparison.
export async function generatePracticeKit(
  question: InterviewQuestion,
  company: string,
  roleFamily: string,
): Promise<PracticeKit> {
  // "fast" = the free GEMINI_API_KEY_FAST; "smart" is the billed key.
  // These banks feed PUBLIC interview-questions SEO pages, so every
  // anonymous visit that misses the cache was hitting the paid meter.
  const raw = await complete(await getModel("gemini", "fast"), {
    systemPrompt: `You are building a runnable coding-practice exercise for ONE specific technical interview question. This will execute in a real, isolated client-side sandbox — the code must actually run correctly, not just look plausible.

Pick the single best-fitting language from: javascript, typescript, python, ruby, sql. Default to javascript if several would fit equally well. Only pick sql if the question is genuinely about data/database/query design (schema design, joins, aggregation, query optimization) — never force an unrelated algorithm question into SQL just for variety.

**For javascript / typescript / python / ruby** (function-based):
1. A single self-contained function (no imports, no external calls, no network/filesystem access, no classes/generators) that solves the problem.
2. functionName: the exact function name, consistent between starterCode and referenceSolution.
3. starterCode: the function signature with a short comment describing the task, and the body either empty or with a single placeholder return/pass/nil — the candidate writes the real logic themselves.
4. referenceSolution: a complete, correct, working implementation with the SAME function name/signature.
5. 1-3 testCases, each a "callExpression" — a literal, directly-executable call to the function with concrete argument values (e.g. "twoSum([2,7,11,15], 9)" for JS/TS, "two_sum([2, 7, 11, 15], 9)" for Python, "two_sum([2, 7, 11, 15], 9)" for Ruby), plus a one-sentence description of what that case covers. Use only built-in types (numbers, strings, lists/arrays, dicts/objects/hashes, booleans) as arguments and return values.

**For sql** (schema-based, one editable block — do NOT set functionName):
There is no separate "call the function" step for SQL — the candidate edits and runs ONE combined block, and only the LAST statement's result is shown. So:
1. starterCode: CREATE TABLE + INSERT statements with realistic sample data (SQLite dialect, since that's what actually executes), followed by a comment "-- Write your query below" and a trivial placeholder final statement like "SELECT 1;" that the candidate replaces with their real query.
2. referenceSolution: the SAME schema-setup statements, followed by the actual correct query as the final statement.
3. Exactly 1 testCase — its "callExpression" field is unused for SQL (put a short placeholder like "(see the editor)") and its "description" states what the query should return (e.g. "should return each department's average salary, highest first").

Return only valid JSON.`,
    userPrompt: `Company: ${company}
Role family: ${roleFamily}
Question: ${question.question}

Return JSON matching this exact shape:
{
  "practiceKit": {
    "language": "javascript" | "typescript" | "python" | "ruby" | "sql",
    "functionName": "string (omit entirely for sql)",
    "starterCode": "string",
    "referenceSolution": "string",
    "testCases": [{ "callExpression": "string", "description": "string" }]
  }
}`,
    temperature: 0.3,
    maxTokens: 1500,
    jsonResponse: true,
  });

  const parsed = JSON.parse(raw);
  const result = practiceKitResultSchema.parse(parsed);
  return result.practiceKit;
}
