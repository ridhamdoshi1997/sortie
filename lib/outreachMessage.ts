import { complete, getModel, type ModelProvider } from "@/lib/models";

// Per-contact outreach message drafts (build-plan.md §F's "Hiring contact
// discovery + outreach drafts" — discovery already shipped via Insider
// Connections, this is the missing "draft the message" half). Deliberately
// short — a real LinkedIn connection-request/InMail note, not an email,
// capped well under LinkedIn's real 300-character connection-note limit.
const SYSTEM_PROMPT = `You are drafting a short LinkedIn outreach message for a candidate to send to someone they've just discovered (a real person who may be able to help with their job search — a former colleague, alumnus, or simply someone at a company they're targeting).

Rules:
- Keep it under 300 characters total — this must fit LinkedIn's real connection-note limit. Be ruthless about brevity.
- Ground the message ONLY in the real, given connection reason (e.g. they worked at the same past company, or attended the same school) and the real target role — never invent shared history or specifics not given.
- Warm, genuine, low-pressure tone — never presumptuous, never asks for a referral outright in a first message.
- No greeting like "Dear" or a formal sign-off — this is a casual LinkedIn note, not an email.

Output ONLY the message text, nothing else — no quotes, no explanation.`;

type OutreachMessageInput = {
  personName: string;
  personTitle: string | null;
  connectionReason: string | null; // e.g. "previously worked at Stripe" or "attended UC Berkeley"
  company: string;
  jobTitle: string | null;
};

export async function generateOutreachMessage(input: OutreachMessageInput, provider: ModelProvider = "gemini"): Promise<string> {
  const firstName = input.personName.split(" ")[0] || input.personName;
  const userPrompt = `Recipient: ${firstName}, ${input.personTitle ?? "role unknown"} at ${input.company}
Real connection reason: ${input.connectionReason ?? "no specific shared history — just a professional at the target company"}
Candidate is interested in: ${input.jobTitle ?? "a role"} at ${input.company}`;

  const raw = await complete(getModel(provider, "fast"), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.6,
    maxTokens: 150,
  });

  return raw.trim().replace(/^"|"$/g, "");
}
