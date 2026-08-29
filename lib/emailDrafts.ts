import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";

// Application email drafts (build-plan.md §C, Phase 11/F31 + the follow-up/
// thank-you generator item). Ephemeral, not persisted — same "draft in
// client state, copy it yourself" pattern as the referral copy generator
// (actions/referralCopy.ts), since there's no single canonical "the" email
// per job the way there's one canonical résumé/cover letter, and this app
// never sends anything on a candidate's behalf.
export type EmailDraftType = "cold_application" | "follow_up" | "thank_you";

export type EmailDraft = { subject: string; body: string };

const TYPE_BRIEF: Record<EmailDraftType, string> = {
  cold_application:
    "A cold application email — the candidate is emailing a hiring contact directly to apply/express interest, likely attaching a resume separately. Professional, concise, states genuine interest and the strongest real fit points.",
  follow_up:
    "A follow-up email after applying with no response yet. Polite, brief, reaffirms interest without sounding impatient or entitled to a response.",
  thank_you:
    "A thank-you email sent after an interview. Warm and specific, references the conversation generically (the candidate will personalize specifics themselves), reaffirms interest and fit.",
};

const SYSTEM_PROMPT = `You are drafting a real job-search email on behalf of a candidate, for them to review, personalize, and send themselves.

Rules:
- Ground every claim about the candidate's fit ONLY in the real data given (their current title, years of experience, and the specific skills that matched this job's own evaluation) — never invent achievements, metrics, or experience not provided.
- Never invent facts about the company beyond its name — no fabricated culture claims, funding, or news.
- Keep it genuinely short — a real person would not read a 5-paragraph cold email. 3-5 short paragraphs max, shorter for the thank-you type.
- Natural, professional, human tone — not generic corporate boilerplate, not overly familiar.
- If an interviewer's name is given for a thank-you email, address them by name. If none is given, use a generic professional greeting instead of inventing one.
- Write a real subject line, not a placeholder.

Output ONLY valid JSON: {"subject": "string", "body": "string"} — body uses \\n for paragraph breaks, no markdown formatting.`;

type EmailDraftInput = {
  type: EmailDraftType;
  jobTitle: string | null;
  company: string | null;
  candidateTitle: string | null;
  yearsExperience: number | null;
  matchedSkills: string[];
  interviewerName?: string | null;
  daysSinceApplied?: number | null;
};

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export async function generateEmailDraft(input: EmailDraftInput, provider: ModelProvider = "gemini", tier: ModelTier = "fast"): Promise<EmailDraft> {
  const userPrompt = `Email type: ${TYPE_BRIEF[input.type]}
Job: ${input.jobTitle ?? "Unknown role"} at ${input.company ?? "Unknown company"}
Candidate's current title: ${input.candidateTitle ?? "not provided"}
Candidate's years of experience: ${input.yearsExperience ?? "not provided"}
Skills this job's own evaluation matched to the candidate: ${input.matchedSkills.length > 0 ? input.matchedSkills.join(", ") : "none recorded"}
${input.type === "follow_up" ? `Days since applying: ${input.daysSinceApplied ?? "unknown"}` : ""}
${input.type === "thank_you" ? `Interviewer's name (address them by name if given): ${input.interviewerName ?? "not provided"}` : ""}`;

  const raw = await complete(await getModel(provider, tier), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.6,
    maxTokens: 500,
    jsonResponse: true,
  });

  try {
    const parsed = JSON.parse(stripJsonFences(raw)) as { subject?: string; body?: string };
    if (parsed.subject && parsed.body) {
      return { subject: parsed.subject, body: parsed.body };
    }
  } catch (error) {
    console.error("[lib/emailDrafts] JSON parse failed", error);
  }

  return { subject: "Draft generation failed", body: "Could not generate a draft — please try again." };
}
