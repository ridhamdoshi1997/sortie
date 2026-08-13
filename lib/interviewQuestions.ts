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
};

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
