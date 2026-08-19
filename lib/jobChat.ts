import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import type { JobEvaluationDimension } from "@/types";

// "Ask Navigator" per-job AI chat (build-plan.md §B) — reuses the same
// chat-round-trip shape as agent/documents.ts's reviseTailoredResume/
// reviseCoverLetter (system prompt + full message history in, one
// structured reply out), pointed at job-fit Q&A instead of document
// revision. Evidence-cited by design: the model only ever sees this job's
// own already-computed 10-dimension evaluation, matched/missing skills,
// and role description — never invents a requirement or company fact
// that isn't in what's supplied.

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type JobChatResult = { reply: string };

const jobChatSchema = z.object({ reply: z.string().min(1) });

function fallbackReply(): JobChatResult {
  return { reply: "Something went wrong answering that — try rephrasing, or ask again in a moment." };
}

export type JobChatContext = {
  title: string;
  company: string;
  aboutRole: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  overallGrade: "A" | "B" | "C" | "D" | "F" | null;
  evaluation: JobEvaluationDimension[] | null;
  titleScopeMismatch: { flagged: boolean; note: string } | null;
};

function buildJobContextText(ctx: JobChatContext): string {
  const evalLines = (ctx.evaluation ?? []).map((d) => `- ${d.dimension}: ${d.grade} — ${d.note}`).join("\n");

  return `JOB: ${ctx.title} at ${ctx.company}
${ctx.aboutRole ? `ROLE DESCRIPTION:\n${ctx.aboutRole}\n` : ""}
OVERALL GRADE: ${ctx.overallGrade ?? "not yet scored"}

10-DIMENSION EVALUATION (this candidate's actual computed fit against this job):
${evalLines || "Not yet evaluated."}

MATCHED SKILLS: ${ctx.matchedSkills.join(", ") || "none recorded"}
MISSING SKILLS: ${ctx.missingSkills.join(", ") || "none recorded"}
${ctx.titleScopeMismatch?.flagged ? `\nSCOPE MISMATCH FLAG: ${ctx.titleScopeMismatch.note}` : ""}`;
}

export const SYSTEM_PROMPT = `You are answering a job candidate's questions about their OWN fit for one specific job — evidence-cited, grounded only in the real evaluation data supplied below, never invented.

Rules:
- Every substantive claim must trace back to a specific piece of the supplied evaluation (a dimension's grade/note, a matched or missing skill, the role description, the scope-mismatch flag if present) — cite it plainly (e.g. "your evaluation grades System Design as a B because...").
- Never invent a job requirement, company fact, or detail not present in what's supplied. If the candidate asks something the data doesn't cover, say so honestly rather than guessing or generalizing from typical job postings.
- Never fabricate a market benchmark or claim about "most candidates" — this is only about this one job and this one candidate's own computed evaluation.
- Plain, direct, conversational — this is a chat, not a report. Keep replies focused (2-5 sentences unless the question genuinely needs more).

Return ONLY valid JSON matching this exact shape:
{ "reply": "string" }`;

export async function askJobChat(
  context: JobChatContext,
  messages: ChatMessage[],
  provider: ModelProvider = "gemini",
): Promise<JobChatResult> {
  const conversationText = messages.map((m) => `${m.role === "user" ? "Candidate" : "You"}: ${m.content}`).join("\n\n");
  const userPrompt = `${buildJobContextText(context)}\n\nCONVERSATION SO FAR:\n${conversationText}`;

  const raw = await complete(getModel(provider, "smart"), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.4,
    maxTokens: 600,
    jsonResponse: true,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/jobChat] JSON parse failed", error);
    return fallbackReply();
  }

  const result = jobChatSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/jobChat] schema validation failed", result.error);
    return fallbackReply();
  }

  return result.data;
}
